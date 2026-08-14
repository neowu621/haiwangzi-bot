"use client";
/**
 * v1062：到場點名的「訂單明細」彈窗。
 *
 * 為什麼不直接連到訂單管理：點名頁教練/助教也在用，而訂單管理是 admin/boss/it 才進得去。
 * 直接把明細顯示在這裡，所有角色都看得到；管理層另外多一個「在訂單管理開啟」的入口。
 *
 * 資料全部來自 /api/admin/attendance/today 已經回傳的欄位，不另外打 API ——
 * 現場點名常常訊號很差，能不多一次往返就不多。
 */
import { useEffect } from "react";
import { useAdminAuth } from "@/lib/admin-web-auth";

export interface AttOrder {
  id: string;
  code?: string | null;
  name: string;
  nickname?: string | null;
  phone: string | null;
  participants: number;
  status: string;
  paymentStatus: string;
  signed: boolean;
  totalAmount: number;
  paidAmount: number;
  creditUsed?: number;
  notes?: string | null;
  tankCount?: number | null;
  rentalGear?: unknown;
  paymentMethod?: string | null;
  createdAt?: string;
}

const PAY_METHOD: Record<string, string> = {
  bank: "轉帳", linepay: "LINE Pay", cash: "現場付款", other: "其他",
};
const PAY_STATUS: Record<string, string> = {
  pending: "待付款", deposit_paid: "已付訂金", fully_paid: "已付清",
  refunding: "退款中", refunded: "已退款",
};
const BK_STATUS: Record<string, string> = {
  pending: "待確認", awaiting_verify: "待確認匯款", confirmed: "已確認",
  completed: "已完成", no_show: "未到場",
};

function gearText(gear: unknown): string {
  if (!Array.isArray(gear) || gear.length === 0) return "無";
  return (gear as Array<{ itemType?: string; qty?: number }>)
    .map((g) => `${g.itemType ?? "裝備"}${(g.qty ?? 1) > 1 ? `×${g.qty}` : ""}`)
    .join("、");
}

export function AttendanceOrderDialog({ order, onClose }: { order: AttOrder | null; onClose: () => void }) {
  const { adminUser } = useAdminAuth();
  const canOpenBookings = (adminUser?.effectiveRoles ?? []).some((r) => r === "admin" || r === "boss" || r === "it");

  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [order, onClose]);

  if (!order) return null;
  const owed = Math.max(0, order.totalAmount - order.paidAmount);

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        style={{ borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13px] font-bold" style={{ color: "var(--color-ocean-deep)" }}>
              {order.code ?? `#${order.id.slice(0, 8)}`}
            </div>
            <div className="mt-0.5 text-base font-bold leading-snug">
              <span style={{ color: "#7c3aed", fontWeight: 800 }}>{order.nickname?.trim() || "?"}</span>
              （{order.name}）
            </div>
            {order.phone && <div className="tabular text-[11px] text-[var(--muted-foreground)]">{order.phone}</div>}
          </div>
          <button onClick={onClose} aria-label="關閉" className="px-1 text-xl leading-none text-[var(--muted-foreground)]">✕</button>
        </div>

        <div className="space-y-1.5 p-4 text-[13px]">
          <Row k="人數" v={`${order.participants} 人`} />
          {order.tankCount != null && <Row k="潛次" v={`${order.tankCount} 支／人`} />}
          <Row k="裝備租借" v={gearText(order.rentalGear)} />
          <Row k="付款方式" v={order.paymentMethod ? PAY_METHOD[order.paymentMethod] ?? order.paymentMethod : "未選"} />
          <Row k="訂單狀態" v={BK_STATUS[order.status] ?? order.status} />
          <Row k="付款狀態" v={PAY_STATUS[order.paymentStatus] ?? order.paymentStatus} />
          <Row k="簽名" v={order.signed ? "✍️ 已簽" : "未簽"} />

          <div className="!mt-3 rounded-lg px-3 py-2" style={{ background: "var(--muted)" }}>
            <Row k="總金額" v={`NT$ ${order.totalAmount.toLocaleString()}`} />
            {(order.creditUsed ?? 0) > 0 && <Row k="抵用金折抵" v={`− NT$ ${(order.creditUsed ?? 0).toLocaleString()}`} />}
            <Row k="已付款" v={`NT$ ${order.paidAmount.toLocaleString()}`} />
            <Row
              k="剩餘應付"
              v={`NT$ ${owed.toLocaleString()}`}
              strong={owed > 0}
            />
          </div>

          {order.notes && (
            <div className="!mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
              style={{ background: "rgba(255,123,90,0.10)", color: "#b3462c" }}>
              📝 訂單備註：{order.notes}
            </div>
          )}

          {order.createdAt && (
            <div className="!mt-3 text-[11px] text-[var(--muted-foreground)]">
              下單時間：{new Date(order.createdAt).toLocaleString("zh-TW")}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
          {canOpenBookings && order.code && (
            <a
              href={`/admin/bookings?code=${encodeURIComponent(order.code)}`}
              className="flex-1 rounded-xl py-2.5 text-center text-sm font-bold text-white"
              style={{ background: "var(--color-ocean-deep)" }}
            >
              在訂單管理開啟
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border py-2.5 text-center text-sm font-bold text-[var(--muted-foreground)]"
            style={{ borderColor: "var(--border)" }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--muted-foreground)]">{k}</span>
      <span className={`tabular text-right ${strong ? "font-bold" : "font-medium"}`}
        style={{ color: strong ? "var(--color-coral)" : undefined }}>
        {v}
      </span>
    </div>
  );
}
