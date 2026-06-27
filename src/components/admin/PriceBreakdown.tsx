"use client";
// v712：訂單金額明細(組成) — 老闆結帳/核對顯示「氣瓶/減免/裝備/抵用金 → 應付」。
//   新訂單用下單時凍結的 priceBreakdown(精確);舊訂單(pb=null)用已存欄位盡力重建(標估算)。
import * as React from "react";

const GEAR_LABEL: Record<string, string> = {
  BCD: "BCD", regulator: "調節器", wetsuit: "防寒衣", fins: "蛙鞋",
  mask: "面鏡", computer: "潛水電腦錶", full_set: "整套優惠",
};
const ntd = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;

interface GearItem { itemType?: string; label?: string; price: number; qty?: number }
export interface PriceBreakdownData {
  kind: "daily" | "tour";
  // daily
  isBoat?: boolean; // v714：船潛(套裝價)
  perTank?: number; tankUnitCharged?: number; staffTankApplied?: boolean;
  tankCount?: number; participants?: number; totalTanks?: number;
  baseTrip?: number; divesAmount?: number; tankDiscountPerTank?: number; autoDiscount?: number;
  gearItems?: GearItem[]; gearAmountRaw?: number; gearAmount?: number; gearDiscountPct?: number;
  promoCode?: string | null; promoDiscount?: number; finalDiscount?: number;
  // tour
  basePrice?: number; addons?: Array<{ label: string; priceDelta: number }>; addonAmount?: number; deposit?: number;
  // 共用
  totalAmount: number; creditUsed?: number; payable?: number;
}

function Row({ label, value, strike, tone, bold }: { label: React.ReactNode; value: string; strike?: string; tone?: "mute" | "ok" | "coral" | "ink"; bold?: boolean }) {
  const color = tone === "ok" ? "#0F6E56" : tone === "coral" ? "#D85A30" : tone === "mute" ? "#7C8A99" : "#16202E";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ color: tone === "mute" ? "#7C8A99" : "#16202E" }}>{label}</span>
      <span style={{ whiteSpace: "nowrap", color, fontWeight: bold ? 700 : 400 }}>
        {strike && <span style={{ color: "#7C8A99", textDecoration: "line-through", marginRight: 4 }}>{strike}</span>}
        {value}
      </span>
    </div>
  );
}

export function PriceBreakdown({ pb, fallback }: {
  pb?: PriceBreakdownData | null;
  fallback?: { type?: "daily" | "tour"; totalAmount: number; creditUsed?: number; rentalGear?: GearItem[]; tankCount?: number | null; participants?: number; extraTank?: number; baseTrip?: number; isBoat?: boolean };
}) {
  const hr = <div style={{ borderTop: "0.5px solid rgba(10,35,66,.12)", margin: "4px 0" }} />;

  // ---- 新訂單:精確明細 ----
  if (pb && pb.kind === "daily") {
    const credit = pb.creditUsed ?? 0;
    const payable = pb.payable ?? Math.max(0, pb.totalAmount - credit);
    const useCharged = pb.tankUnitCharged ?? pb.perTank ?? 0;
    const tankDisc = pb.tankDiscountPerTank ?? 0;
    const auto = pb.autoDiscount ?? 0;
    const promo = pb.promoDiscount ?? 0;
    // 活動減免(每支)勝出 → 折進氣瓶那行;優惠代碼(%)勝出 → 另列一行
    const autoWon = auto > 0 && auto >= promo;
    const promoWon = promo > 0 && promo > auto;
    const dives = pb.divesAmount ?? 0;
    const netDives = dives - (autoWon ? auto : 0);
    const cnt = pb.tankCount ?? 1;
    const ppl = pb.participants ?? 1;
    const tankLabel = pb.isBoat
      ? `船潛套裝 ${autoWon ? `(${ntd(pb.perTank ?? 0)} − 優惠 ${tankDisc}×${cnt}潛)` : ntd(pb.perTank ?? 0)} × ${ppl} 人（含 ${cnt} 潛）`
      : `氣瓶 ${autoWon ? `(${ntd(useCharged)} − 優惠 ${tankDisc})` : ntd(useCharged)} × ${cnt} 支 × ${ppl} 人${pb.staffTankApplied ? "（教練價）" : ""}`;
    return (
      <div>
        <Row
          label={tankLabel}
          strike={!pb.isBoat && pb.staffTankApplied && pb.perTank && pb.perTank !== useCharged ? ntd(pb.perTank) : undefined}
          value={ntd(netDives)}
        />
        {(pb.baseTrip ?? 0) > 0 && <Row label="基本費（整單）" value={ntd(pb.baseTrip ?? 0)} />}
        {(pb.gearAmount ?? 0) > 0 && (
          <Row
            label={`裝備租借${pb.gearItems?.length ? `（${pb.gearItems.map((g) => `${GEAR_LABEL[g.itemType ?? ""] ?? g.label ?? g.itemType}${(g.qty ?? 1) > 1 ? `×${g.qty}` : ""}`).join("、")}）` : ""}`}
            strike={(pb.gearDiscountPct ?? 100) < 100 ? `+${ntd(pb.gearAmountRaw ?? 0)}` : undefined}
            value={`+ ${ntd(pb.gearAmount ?? 0)}`}
          />
        )}
        {promoWon && (
          <Row label={`優惠代碼 ${pb.promoCode ?? ""}`} value={`− ${ntd(promo)}`} tone="ok" />
        )}
        {hr}
        <Row label="訂單總額" value={ntd(pb.totalAmount)} bold />
        {credit > 0 && <Row label="抵用金折抵" value={`− ${ntd(credit)}`} tone="coral" />}
        <Row label="應付" value={ntd(payable)} tone="coral" bold />
      </div>
    );
  }
  if (pb && pb.kind === "tour") {
    const credit = pb.creditUsed ?? 0;
    const payable = pb.payable ?? Math.max(0, pb.totalAmount - credit);
    return (
      <div>
        <Row label={`團費 ${ntd(pb.basePrice ?? 0)} × ${pb.participants ?? 1} 人`} value={ntd((pb.basePrice ?? 0) * (pb.participants ?? 1))} />
        {(pb.addons ?? []).map((a, i) => (
          <Row key={i} label={`加購 ${a.label} × ${pb.participants ?? 1} 人`} value={`+ ${ntd(a.priceDelta * (pb.participants ?? 1))}`} />
        ))}
        {hr}
        <Row label="訂單總額" value={ntd(pb.totalAmount)} bold />
        {(pb.deposit ?? 0) > 0 && <Row label="訂金" value={ntd(pb.deposit ?? 0)} tone="mute" />}
        {credit > 0 && <Row label="抵用金折抵" value={`− ${ntd(credit)}`} tone="coral" />}
        <Row label="應付" value={ntd(payable)} tone="coral" bold />
      </div>
    );
  }

  // ---- 舊訂單:用場次氣瓶單價盡力重建(無凍結明細) ----
  if (fallback) {
    const gearRaw = (fallback.rentalGear ?? []).reduce((s, g) => s + g.price * (g.qty ?? 1), 0);
    const credit = fallback.creditUsed ?? 0;
    const cnt = fallback.tankCount ?? 1;
    const ppl = fallback.participants ?? 1;
    const extraTank = fallback.extraTank ?? 0;
    const baseTrip = fallback.baseTrip ?? 0;
    const hasTripPrice = extraTank > 0;
    // 有場次氣瓶單價 → 列出氣瓶毛額,折抵 = 毛額+基本費+裝備 − 訂單總額(含活動減免/裝備折)
    const grossDives = fallback.isBoat ? extraTank * ppl : extraTank * cnt * ppl;
    const subtotal = grossDives + baseTrip + gearRaw;
    const discount = Math.max(0, subtotal - fallback.totalAmount);
    if (hasTripPrice) {
      return (
        <div>
          <Row
            label={fallback.isBoat ? `船潛套裝 ${ntd(extraTank)} × ${ppl} 人（含 ${cnt} 潛）` : `氣瓶 ${ntd(extraTank)} × ${cnt} 支 × ${ppl} 人`}
            value={ntd(grossDives)}
          />
          {baseTrip > 0 && <Row label="基本費（整單）" value={ntd(baseTrip)} />}
          {gearRaw > 0 && <Row label="裝備租借" value={`+ ${ntd(gearRaw)}`} />}
          {discount > 0 && <Row label="折抵（活動減免/優惠/裝備折）" value={`− ${ntd(discount)}`} tone="ok" />}
          {hr}
          <Row label="訂單總額" value={ntd(fallback.totalAmount)} bold />
          {credit > 0 && <Row label="抵用金折抵" value={`− ${ntd(credit)}`} tone="coral" />}
          <Row label="應付" value={ntd(Math.max(0, fallback.totalAmount - credit))} tone="coral" bold />
          <div style={{ fontSize: 10.5, color: "#7C8A99", marginTop: 4 }}>※ 舊訂單以場次現價估算（折抵為合計）</div>
        </div>
      );
    }
    // 連場次價都沒有 → 最簡估算
    const rest = Math.max(0, fallback.totalAmount - gearRaw);
    return (
      <div>
        <Row label={`氣瓶 / 場次費${fallback.tankCount ? `（${cnt} 支 × ${ppl} 人）` : ""}`} value={ntd(rest)} />
        {gearRaw > 0 && <Row label="裝備租借" value={`+ ${ntd(gearRaw)}`} />}
        {hr}
        <Row label="訂單總額" value={ntd(fallback.totalAmount)} bold />
        {credit > 0 && <Row label="抵用金折抵" value={`− ${ntd(credit)}`} tone="coral" />}
        <Row label="應付" value={ntd(Math.max(0, fallback.totalAmount - credit))} tone="coral" bold />
        <div style={{ fontSize: 10.5, color: "#7C8A99", marginTop: 4 }}>※ 舊訂單明細為估算（下單時未凍結）</div>
      </div>
    );
  }
  return null;
}
