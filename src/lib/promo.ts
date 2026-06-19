// v590：節慶優惠代碼 + 日潛早鳥回饋 — 共用邏輯（產碼 / 驗證 / 算折扣 / 早鳥級距）。
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

// 7 碼英數，排除易混淆字（0/O、1/I/L）與符號 → 好念好打、不跟 % 混淆
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 7;

export function genPromoCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

// 產生「不重複」代碼（撞了重抽，最多 20 次）
export async function genUniquePromoCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genPromoCode();
    const exists = await prisma.promoCode.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("無法產生不重複代碼，請重試");
}

export interface EarlyBirdTier {
  weeks: number; // 提早幾週
  credit: number; // 回饋抵用金 NT$
}

// 早鳥回饋：提早天數 + 滿額 → 回饋金額（越早越多，取符合的最高級）。不符合回 0。
export function earlyBirdCredit(
  tiers: EarlyBirdTier[],
  leadDays: number,
  orderAmount: number,
  minAmount: number,
): number {
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;
  if (orderAmount < (minAmount || 0)) return 0;
  let best = 0;
  for (const t of tiers) {
    const needDays = Math.round(Number(t.weeks ?? 0) * 7);
    const credit = Math.floor(Number(t.credit ?? 0));
    if (needDays > 0 && credit > 0 && leadDays >= needDays) best = Math.max(best, credit);
  }
  return best;
}

export interface PromoCodeRow {
  discountType: string; // per_tank | percent
  discountValue: number;
  minAmount: number;
}

// 算代碼折抵金額（NT$）。per_tank：每支氣瓶折 value × 總支數；percent：訂單 × value%。
// 不低於 0、不超過訂單金額。未達 minAmount → 0。
export function computeCodeDiscount(
  promo: PromoCodeRow,
  ctx: { orderAmount: number; totalTanks: number },
): number {
  if (ctx.orderAmount < (promo.minAmount || 0)) return 0;
  let d = 0;
  if (promo.discountType === "per_tank") d = Math.floor(promo.discountValue) * Math.max(0, ctx.totalTanks);
  else if (promo.discountType === "percent") d = Math.round((ctx.orderAmount * Math.floor(promo.discountValue)) / 100);
  return Math.max(0, Math.min(d, ctx.orderAmount));
}

export interface ValidateCtx {
  nowMs?: number;
  type?: "daily" | "tour"; // 此訂單型態
  orderAmount?: number;
  userId?: string;
  userVipLevel?: number;
}

export interface ValidateResult {
  ok: boolean;
  reason?: string;
  promo?: {
    id: string;
    title: string;
    code: string;
    discountType: string;
    discountValue: number;
    minAmount: number;
  };
}

// 驗證代碼此刻是否可用（啟用 / 期間 / 適用型態 / 滿額 / 客群 / 總量 / 每人限用）。
export async function validatePromoCode(code: string, ctx: ValidateCtx = {}): Promise<ValidateResult> {
  const now = ctx.nowMs ?? Date.now();
  const c = (code || "").trim().toUpperCase();
  if (!c) return { ok: false, reason: "請輸入優惠代碼" };

  const p = await prisma.promoCode.findUnique({ where: { code: c } });
  if (!p || !p.enabled) return { ok: false, reason: "查無此優惠代碼" };
  if (now < new Date(p.startAt).getTime()) return { ok: false, reason: "優惠尚未開始" };
  if (now > new Date(p.endAt).getTime()) return { ok: false, reason: "優惠已過期" };
  if (ctx.type && p.appliesTo !== "both" && p.appliesTo !== ctx.type)
    return { ok: false, reason: "此優惠不適用本類型訂單" };
  if (ctx.orderAmount != null && ctx.orderAmount < p.minAmount)
    return { ok: false, reason: `需消費滿 NT$${p.minAmount.toLocaleString()}` };
  if (p.audienceTag === "vip5" && (ctx.userVipLevel ?? 0) < 5)
    return { ok: false, reason: "此優惠限 VIP5 會員" };
  if (p.totalLimit > 0 && p.usedCount >= p.totalLimit)
    return { ok: false, reason: "此優惠已被領完" };
  if (p.perUserLimit > 0 && ctx.userId) {
    const used = await prisma.booking.count({
      where: { userId: ctx.userId, promoCode: c, status: { notIn: ["cancelled_by_user", "cancelled_by_weather"] } },
    });
    if (used >= p.perUserLimit) return { ok: false, reason: "您已用過此優惠" };
  }
  return {
    ok: true,
    promo: { id: p.id, title: p.title, code: p.code, discountType: p.discountType, discountValue: p.discountValue, minAmount: p.minAmount },
  };
}
