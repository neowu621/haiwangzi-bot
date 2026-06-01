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
  vip_upgrade: 360,
  admin_adjust: 360,
  refund: 0,
  used: 0,
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
  };
  cached = { value: map, ts: Date.now() };
  return map;
}

/** 依 reason 算出到期日；overrideDays 不為 undefined 時優先採用 */
export async function computeExpiry(
  reason: CreditReason,
  overrideDays?: number,
): Promise<Date | null> {
  const days = overrideDays !== undefined ? overrideDays : (await readExpiryDaysFromDB())[reason];
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
