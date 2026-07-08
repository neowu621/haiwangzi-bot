/**
 * VIP 升級獎勵抵用金 — 自動發放邏輯
 *
 * 設計：
 * - 會員首次達到某 LV 時自動發放該 LV 的 upgradeCredit
 * - 每個 LV 僅發放一次（用既有 CreditTx 紀錄 refType="vip" + refId=String(level) 去重）
 * - 若會員後來降級又升級回去，不會重複發
 * - 若會員一次跨多級，會逐級補發中間每一級的獎勵
 * - 統一用既有 grantCredit() helper，與 attendance 流程一致
 */
import { prisma } from "./prisma";
import { grantCredit } from "./credit";
import { computeExpiry } from "./credit-expiry";
import type { VipTier } from "./vip-tier";

/**
 * 在會員等級升級後呼叫，自動發放對應的 upgradeCredit
 * v347：VIP 升等一律是「系統規則自動發放」，經辦人固定記 "system"（顯示為 🤖 系統發），
 *        即使由 admin 儲存 VIP 設定觸發全員重算也一樣 — 不歸在某個管理員名下。
 *        actorId 參數保留僅供相容，已不再用於 createdBy。
 * @returns 實際發放的金額總和
 */
export async function grantVipUpgradeRewards(
  userId: string,
  oldLevel: number,
  newLevel: number,
  tiers: VipTier[],
  _actorId?: string,
): Promise<number> {
  if (newLevel <= oldLevel) return 0;

  const tiersToReward = tiers
    .filter((t) => t.level > oldLevel && t.level <= newLevel && (t.upgradeCredit ?? 0) > 0)
    .sort((a, b) => a.level - b.level);

  if (tiersToReward.length === 0) return 0;

  let totalGranted = 0;
  for (const tier of tiersToReward) {
    const refId = String(tier.level); // 與 attendance 路徑用同一格式，便於去重
    const exists = await prisma.creditTx.findFirst({
      where: { userId, refType: "vip", refId, reason: "vip_upgrade" },
      select: { id: true },
    });
    if (exists) continue; // 已發過

    try {
      // v823：優先用該等級自訂的使用期限（天）；未設則 fallback 全站 vipUpgradeCreditExpiryDays
      const expiresAt = await computeExpiry("vip_upgrade", tier.upgradeCreditExpiryDays);
      await grantCredit({ skipNotify: true,
        userId,
        amount: tier.upgradeCredit,
        reason: "vip_upgrade",
        refType: "vip",
        refId,
        note: `升等 LV${tier.level} ${tier.name} 獎勵`,
        createdBy: "system", // v347：VIP 升等固定系統發，不歸管理員
        expiresAt,
      });
      totalGranted += tier.upgradeCredit;
    } catch (e) {
      console.error("[grantVipUpgradeRewards]", userId, tier.level, e);
    }
  }

  return totalGranted;
}
