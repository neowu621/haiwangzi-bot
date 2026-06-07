// v392：氣瓶限時折扣 — 判斷「此刻是否生效」的共用邏輯（後端下單 + /api/me 顯示共用）

export interface TankPromoCfg {
  tankPromoEnabled?: boolean | null;
  tankPromoDiscount?: number | null;
  tankPromoReason?: string | null;
  tankPromoStart?: Date | string | null;
  tankPromoEnd?: Date | string | null;
}

export interface ActiveTankPromo {
  active: boolean;
  discount: number; // 每支氣瓶折抵 NT$
  reason: string;
}

const OFF: ActiveTankPromo = { active: false, discount: 0, reason: "" };

// 回傳「此刻」生效的氣瓶折扣；未啟用 / 折抵<=0 / 不在起訖區間 → active:false, discount:0
export function getActiveTankPromo(
  cfg: TankPromoCfg | null | undefined,
  nowMs: number = Date.now(),
): ActiveTankPromo {
  if (!cfg?.tankPromoEnabled) return OFF;
  const discount = Math.floor(Number(cfg.tankPromoDiscount ?? 0));
  if (!(discount > 0)) return OFF;
  const start = cfg.tankPromoStart ? new Date(cfg.tankPromoStart).getTime() : null;
  const end = cfg.tankPromoEnd ? new Date(cfg.tankPromoEnd).getTime() : null;
  if (start != null && !Number.isNaN(start) && nowMs < start) return OFF;
  if (end != null && !Number.isNaN(end) && nowMs > end) return OFF;
  return { active: true, discount, reason: cfg.tankPromoReason ?? "" };
}
