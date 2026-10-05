/**
 * v185 抵用金有效天數 helper
 *
 * 各類別預設天數從 SiteConfig 讀，未設則用 fallback
 *   - birthday        → birthdayCreditExpiryDays (預設 360)
 *   - vip_upgrade     → vipUpgradeCreditExpiryDays (預設 360)
 *   - admin_adjust    → adminGrantCreditExpiryDays (預設 360)
 *   - refund          → refundCreditExpiryDays (預設 0 永不過期)
 *
 * 用法：
 *   const expiresAt = await computeExpiry("birthday");
 *   await grantCredit({ ..., expiresAt });
 */
import { prisma } from "./prisma";
import type { CreditReason } from "./credit";

const DEFAULTS: Record<CreditReason, number> = {
  birthday: 360,
  vip_upgrade: 0, // v1082：永不過期（見 NEVER_EXPIRE）
  admin_adjust: 360,
  refund: 0,
  used: 0,
  first_order_reward: 0, // v1082：永不過期（見 NEVER_EXPIRE）
  signup_reward: 0, // v388：依 signupRewardExpiryDays（這裡只是 fallback；發放點自帶 expiresAt）
  vip_overflow: 0, // v388：VIP 滿級回饋，預設不過期
  early_bird: 30, // v592：早鳥回饋（發放點自帶 30 天 expiresAt）
  expired: 0, // v592：到期作廢紀錄（負數，不適用）
};

let cached: { value: Record<CreditReason, number>; ts: number } | null = null;
const CACHE_MS = 60_000;

async function readExpiryDaysFromDB(): Promise<Record<CreditReason, number>> {
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  const map: Record<CreditReason, number> = {
    birthday: cfg?.birthdayCreditExpiryDays ?? DEFAULTS.birthday,
    vip_upgrade: cfg?.vipUpgradeCreditExpiryDays ?? DEFAULTS.vip_upgrade,
    admin_adjust: cfg?.adminGrantCreditExpiryDays ?? DEFAULTS.admin_adjust,
    refund: cfg?.refundCreditExpiryDays ?? DEFAULTS.refund,
    used: 0,
    first_order_reward:
      (cfg as unknown as { firstOrderRewardExpiryDays?: number } | null)
        ?.firstOrderRewardExpiryDays ?? DEFAULTS.first_order_reward,
    signup_reward:
      (cfg as unknown as { signupRewardExpiryDays?: number } | null)
        ?.signupRewardExpiryDays ?? DEFAULTS.signup_reward,
    vip_overflow: DEFAULTS.vip_overflow,
    early_bird: DEFAULTS.early_bird,
    expired: DEFAULTS.expired,
  };
  cached = { value: map, ts: Date.now() };
  return map;
}

/**
 * v1082：這幾類獎勵「永遠不會過期」，而且是**業務規則，不是設定值**。
 *
 *   理由（老闆的話）：這些都只會發一次，目的是鼓勵大家回來潛水。
 *   一份一輩子只拿得到一次的鼓勵，設了期限就變成「沒在期限內回來就沒收」，
 *   跟發它的用意剛好相反。
 *
 *   所以用硬規則擋在 computeExpiry 最前面 —— 連 overrideDays 和後台設定都蓋不過。
 *   否則只要有人把後台欄位改回 360，往後發的又會開始過期，而且不會有人發現。
 */
const NEVER_EXPIRE: ReadonlySet<CreditReason> = new Set<CreditReason>([
  "first_order_reward", // 首潛獎勵：一個 LINE 帳號一輩子一次
  "vip_upgrade",        // 升等獎勵：每個等級一次
  "vip_overflow",       // 滿級回饋（本來就是 0，列進來讓規則集中在一處）
  // ⚠️ refund 刻意不列入 —— 它的到期日後台 refundCreditExpiryDays 設得到也會生效，
  //    放進來等於偷偷關掉一個還在用的開關。退款轉抵用金目前由發放點
  //    (api/admin/bookings/[id]/refund) 自己帶 expiresAt: null，規則已經在那裡了。
]);

/** 依 reason 算出到期日；overrideDays 不為 undefined 時優先採用 */
export async function computeExpiry(
  reason: CreditReason,
  overrideDays?: number,
): Promise<Date | null> {
  // v1082：永不過期的類別直接回 null —— 設定與 overrideDays 都蓋不過
  if (NEVER_EXPIRE.has(reason)) return null;
  const days = overrideDays !== undefined ? overrideDays : (await readExpiryDaysFromDB())[reason];
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
