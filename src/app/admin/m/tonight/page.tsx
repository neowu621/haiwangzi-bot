"use client";
// 手機「老闆結帳」（/admin/m/tonight）— v734：老闆「現在要及時處理 / 知道」的四區待辦。
//   1) 💰 已匯款·待你確認（payment_proof status=pending）— 要核可
//   2) 🧾 已下訂·尚未付款（status=pending，未上傳證明）— 等客戶匯款，可催繳
//   3) ✅ 已付款·待出團（已付清/已收訂金，活動日在未來 14 天內）— 知道、備料
//   4) 📝 新願望·待回覆
//   點任一筆訂單 → 底部彈窗顯示該筆完整詳細（<OrderDetail>，含金額明細 + 核可/退回 + 打電話）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { OrderDetail } from "@/components/admin-web/OrderDetail";
import { X } from "lucide-react";

interface ProofRow {
  id: string;
  bookingId: string;
  type: "deposit" | "final" | "refund";
  amount: number;
  last5: string | null;
  booking: {
    code: string | null;
    participants?: number;
    activityDate?: string;
    activitySite?: string;
    notes?: string | null; // v843：客戶訂單備註
    user: { displayName: string; realName: string | null };
  };
}
interface ProofsResp { proofs: ProofRow[] }

interface BookingRow {
  id: string;
  code?: string | null;
  participants?: number;
  totalAmount?: number;
  paidAmount?: number;
  creditUsed?: number;
  paymentStatus?: string;
  status: string;
  notes?: string | null; // v843：客戶訂單備註（老闆結帳列表一起顯示）
  ref?: { date?: string; dateStart?: string; startTime?: string; sites?: string[]; title?: string };
  user?: { displayName: string; realName: string | null };
}
interface BookingsResp { bookings: BookingRow[] }

interface WishRow {
  id: string;
  type: string;
  preferredDate: string;
  participants: number;
  customerNote: string | null;
  user: { displayName: string; realName: string | null };
}
interface WishesResp { wishes: WishRow[] }

const TYPE_LABEL: Record<string, string> = { deposit: "訂金", final: "尾款", refund: "退款" };
const WISH_TYPE_LABEL: Record<string, string> = { boat: "船潛", shore: "岸潛", night: "夜潛", tour: "潛水團" };

const TAIPEI = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

export default function MobileTonightPage() {
  const { ready } = useAdminAuth();
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [pendingUnpaid, setPendingUnpaid] = useState<BookingRow[]>([]);
  const [paidUpcoming, setPaidUpcoming] = useState<BookingRow[]>([]);
  const [pendingWishes, setPendingWishes] = useState<WishRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    Promise.all([
      adminFetch<ProofsResp>(`/api/admin/payment-proofs?status=pending`),
      adminFetch<BookingsResp>(`/api/admin/bookings?light=1`),
      adminFetch<WishesResp>(`/api/admin/dive-wishes?status=pending`),
    ])
      .then(([proofData, bookingData, wishData]) => {
        setProofs(proofData.proofs ?? []);
        setPendingWishes(wishData.wishes ?? []);
        const allBk = bookingData.bookings ?? [];
        const byDateAsc = (a: BookingRow, b: BookingRow) => {
          const da = a.ref?.date ?? a.ref?.dateStart ?? "";
          const db = b.ref?.date ?? b.ref?.dateStart ?? "";
          return da < db ? -1 : da > db ? 1 : 0;
        };
        // 1) 已下訂·待匯款（pending，未上傳證明）
        setPendingUnpaid(allBk.filter((b) => b.status === "pending").sort(byDateAsc));
        // 2) 已付款·待出團（已付清/已收訂金，活動日 today..+14）
        const today = TAIPEI(Date.now());
        const in14 = TAIPEI(Date.now() + 14 * 86400000);
        setPaidUpcoming(
          allBk
            .filter((b) => {
              const d = b.ref?.date ?? b.ref?.dateStart;
              if (!d) return false;
              const paid = b.paymentStatus === "fully_paid" || b.paymentStatus === "deposit_paid";
              const notCancelled = !b.status.startsWith("cancelled") && b.status !== "no_show";
              return paid && notCancelled && d >= today && d <= in14;
            })
            .sort(byDateAsc),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [ready]);

  useEffect(() => { load(); }, [load]);

  const payable = (b: BookingRow) => Math.max(0, (b.totalAmount ?? 0) - (b.paidAmount ?? 0));
  const refLabel = (b: BookingRow) => {
    const d = b.ref?.date ?? b.ref?.dateStart;
    return b.ref?.title ? b.ref.title : `${d ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
  };

  return (
    <MobileAdminShell title="老闆結帳" back="/admin/m">
      {error && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>
          載入失敗：{error}
        </div>
      )}

      {/* 1) 已匯款·待你確認 */}
      <Section title={`💰 已匯款・待你確認（${proofs.length}）`} accent>
        {proofs.length === 0 ? (
          <Empty text="沒有待確認的匯款" />
        ) : (
          proofs.map((p) => (
            <Card key={p.id} onClick={() => setOpenId(p.bookingId)}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{p.booking.user.realName ?? p.booking.user.displayName}</span>
                <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: "var(--color-coral)" }}>${p.amount.toLocaleString()}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {TYPE_LABEL[p.type]}{p.booking.code ? `・${p.booking.code}` : ""}{p.last5 ? `・後5碼 ${p.last5}` : ""}
                {p.booking.activityDate ? `・${p.booking.activityDate}` : ""}
              </div>
              {p.booking.notes && p.booking.notes.trim() && (
                <div className="mt-1 rounded-md px-2.5 py-1.5 text-[14px] font-bold" style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>📝 訂單備註：{p.booking.notes}</div>
              )}
            </Card>
          ))
        )}
      </Section>

      {/* 2) 已下訂·尚未付款 */}
      {pendingUnpaid.length > 0 && (
        <Section title={`🧾 已下訂・尚未付款（${pendingUnpaid.length}）`}>
          {pendingUnpaid.map((b) => (
            <Card key={b.id} onClick={() => setOpenId(b.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{b.user?.realName ?? b.user?.displayName ?? "客戶"}</span>
                <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: "var(--color-coral)" }}>${payable(b).toLocaleString()}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {b.ref?.title ? "✈️" : "🔱"} {refLabel(b) || "—"}・{b.participants ?? 1} 位
                {(b.creditUsed ?? 0) > 0 ? `・已折 NT$ ${(b.creditUsed ?? 0).toLocaleString()}` : ""}
                <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700">待匯款</span>
              </div>
              {b.notes && b.notes.trim() && (
                <div className="mt-1 rounded-md px-2.5 py-1.5 text-[14px] font-bold" style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>📝 訂單備註：{b.notes}</div>
              )}
            </Card>
          ))}
        </Section>
      )}

      {/* 3) 已付款·待出團（近 14 天） */}
      {paidUpcoming.length > 0 && (
        <Section title={`✅ 已付款・待出團（近14天・${paidUpcoming.length}）`}>
          {paidUpcoming.map((b) => (
            <Card key={b.id} onClick={() => setOpenId(b.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{b.user?.realName ?? b.user?.displayName ?? "客戶"}</span>
                <span className="flex-shrink-0 font-mono text-sm tabular-nums" style={{ color: "var(--muted-foreground)" }}>${(b.totalAmount ?? 0).toLocaleString()}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {b.ref?.title ? "✈️" : "🔱"} {refLabel(b) || "—"}・{b.participants ?? 1} 位
                <span className="ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "#E1F5EE", color: "#0F6E56" }}>{b.paymentStatus === "deposit_paid" ? "已收訂金" : "已付清"}</span>
              </div>
              {b.notes && b.notes.trim() && (
                <div className="mt-1 rounded-md px-2.5 py-1.5 text-[14px] font-bold" style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>📝 訂單備註：{b.notes}</div>
              )}
            </Card>
          ))}
        </Section>
      )}

      {/* 4) 新願望·待回覆 */}
      {pendingWishes.length > 0 && (
        <Section title={`📝 新願望・待回覆（${pendingWishes.length}）`}>
          {pendingWishes.map((w) => (
            <Link key={w.id} href="/admin/m/dive-wishes" className="block rounded-xl border px-3 py-2.5 active:scale-[0.99]" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{w.user.realName ?? w.user.displayName}</span>
                <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{WISH_TYPE_LABEL[w.type] ?? w.type}・{w.participants} 位</span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>📝 {w.customerNote || w.preferredDate || "—"}</div>
            </Link>
          ))}
        </Section>
      )}

      {/* 完整列表入口 */}
      <div className="mt-5 flex gap-2">
        <Link href="/admin/m/bookings" className="flex-1 rounded-lg border py-2 text-center text-xs font-medium" style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--color-ocean-deep)" }}>📖 看全部訂單</Link>
        <Link href="/admin/m/dive-wishes" className="flex-1 rounded-lg border py-2 text-center text-xs font-medium" style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--color-ocean-deep)" }}>📝 看全部願望</Link>
      </div>

      {loading && <div className="flex justify-center py-4"><DiverLoader label="載入中…" size={90} /></div>}

      {/* 底部彈窗：訂單詳細 */}
      {openId && (
        <div
          onClick={() => setOpenId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,35,66,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full"
            style={{ background: "var(--color-pearl, #f4f7fb)", borderRadius: "16px 16px 0 0", maxHeight: "86vh", overflowY: "auto", padding: "14px 14px 28px" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-bold">訂單詳細</span>
              <button type="button" onClick={() => setOpenId(null)} aria-label="關閉" className="rounded-full p-1" style={{ color: "var(--muted-foreground)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <OrderDetail id={openId} onActed={load} />
          </div>
        </div>
      )}
    </MobileAdminShell>
  );
}

function Section({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 mt-1 px-1 text-sm font-bold" style={{ color: accent ? "var(--color-coral)" : "var(--color-ocean-deep)" }}>{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Card({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-xl border px-3 py-2.5 text-left active:scale-[0.99]" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--muted-foreground)" }}>{text}</div>;
}
