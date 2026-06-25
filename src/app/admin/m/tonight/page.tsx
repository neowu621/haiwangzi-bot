"use client";
// 手機簡版「老闆結帳」（/admin/m/tonight）— 對應桌機 /admin/tonight：
//   Section 1：待匯款確認（payment_proof status=pending，不限日期）
//     每筆：客戶 / 金額 / 後5碼 / 訂單編號 + 縮圖，動作 [確認收款] / [退回]
//   Section 2：待到場確認（confirmed + 今/昨日場次）—— 計算量大，只算「筆數」
//     再深連到 /admin/tonight 做完整批次到場。手機顧流量：到場列表交給桌機版。
//   走輕量 GET，動作沿用桌機既有 verify / reject endpoint。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Check, X, ImageOff } from "lucide-react";

interface ProofBooking {
  id: string;
  code: string | null;
  userId: string;
  participants?: number;
  notes?: string | null;
  adminNotes?: string | null;
  activityDate?: string;
  activitySite?: string;
  tripBooked?: number | null;
  tripCapacity?: number | null;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  user: { displayName: string; realName: string | null; phone: string | null };
}
interface ProofRow {
  id: string;
  bookingId: string;
  type: "deposit" | "final" | "refund";
  amount: number;
  imageKey: string | null;
  previewUrl: string | null;
  thumb: string | null;
  uploadedAt: string;
  last5: string | null;
  note: string | null;
  booking: ProofBooking;
}
interface ProofsResp {
  proofs: ProofRow[];
}

// 桌機 /admin/tonight 的 booking 形狀（算「待到場」筆數 + v674「已下單·待匯款」列表）
interface BookingRow {
  id: string;
  code?: string | null;
  userId?: string;
  participants?: number;
  totalAmount?: number;
  status: string;
  ref?: { date?: string; dateStart?: string; startTime?: string; sites?: string[]; title?: string };
  user?: { displayName: string; realName: string | null; phone: string | null };
}
interface BookingsResp {
  bookings: BookingRow[];
}

const TYPE_LABEL: Record<ProofRow["type"], string> = {
  deposit: "訂金",
  final: "尾款",
  refund: "退款",
};

export default function MobileTonightPage() {
  const { ready } = useAdminAuth();
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [pendingUnpaid, setPendingUnpaid] = useState<BookingRow[]>([]); // v674：已下單·待匯款
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [imgErrored, setImgErrored] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      adminFetch<ProofsResp>(`/api/admin/payment-proofs?status=pending`),
      adminFetch<BookingsResp>(`/api/admin/bookings?light=1`),
    ])
      .then(([proofData, bookingData]) => {
        if (!alive) return;
        setProofs(proofData.proofs ?? []);
        const allBk = bookingData.bookings ?? [];
        // v680：「待到場」已移除（改用獨立「到場點名」），這裡只算「已下單·待匯款」
        // v674：已下單·待匯款（status=pending，尚未上傳付款證明），近的排前
        setPendingUnpaid(
          allBk
            .filter((b) => b.status === "pending")
            .sort((a, b) => {
              const da = a.ref?.date ?? a.ref?.dateStart ?? "";
              const db = b.ref?.date ?? b.ref?.dateStart ?? "";
              return da < db ? -1 : da > db ? 1 : 0;
            }),
        );
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  async function verifyProof(id: string) {
    setActing(id);
    setMsg(null);
    try {
      await adminFetch(`/api/admin/payment-proofs/${id}/verify`, { method: "POST" });
      setProofs((prev) => prev.filter((p) => p.id !== id));
      setMsg("已確認收款");
    } catch (e) {
      setMsg("確認失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  async function rejectProof(p: ProofRow) {
    const name = p.booking.user.realName ?? p.booking.user.displayName;
    const reason = window.prompt(
      `退回 ${name} 的付款證明 NT$${p.amount.toLocaleString()}\n\n請填寫退回原因（會推 LINE 通知客戶）：`,
    );
    if (!reason || !reason.trim()) return;
    setActing(p.id);
    setMsg(null);
    try {
      await adminFetch(`/api/admin/payment-proofs/${p.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setProofs((prev) => prev.filter((x) => x.id !== p.id));
      setMsg("已退回並通知客戶");
    } catch (e) {
      setMsg("退回失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  return (
    <MobileAdminShell title="老闆結帳" back="/admin/m">
      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {msg && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(99,235,164,0.12)", color: "#047857" }}
        >
          {msg}
        </div>
      )}

      {/* ===== Section 1：待匯款確認 ===== */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>
          待匯款確認{proofs.length > 0 ? `（${proofs.length}）` : ""}
        </span>
      </div>

      <div className="space-y-2">
        {proofs.map((p) => {
          const name = p.booking.user.realName ?? p.booking.user.displayName;
          const img = p.previewUrl || p.thumb;
          const showImg = img && !imgErrored.has(p.id);
          return (
            <div
              key={p.id}
              className="rounded-xl border px-3 py-2.5"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="flex items-start gap-3">
                {showImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img ?? ""}
                    alt="付款證明"
                    loading="lazy"
                    className="h-16 w-16 flex-shrink-0 rounded-lg border object-cover"
                    style={{ borderColor: "rgba(0,0,0,0.08)" }}
                    onClick={() => img && window.open(img, "_blank", "noopener")}
                    onError={() => setImgErrored((s) => new Set(s).add(p.id))}
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[9px]"
                    style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--muted-foreground)" }}
                  >
                    <ImageOff className="h-4 w-4 opacity-60" />
                    無圖
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{name}</span>
                    <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: "var(--color-coral)" }}>
                      ${p.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {TYPE_LABEL[p.type]}
                    {p.booking.code ? `・${p.booking.code}` : ""}
                    {p.last5 ? `・後5碼 ${p.last5}` : ""}
                  </div>
                  {/* v620：出團 + 該場次已參加人數 */}
                  {(p.booking.activityDate || p.booking.activitySite) && (
                    <div className="mt-0.5 truncate text-[11px] text-slate-600">
                      🤿 {p.booking.activityDate}{p.booking.activitySite ? `　${p.booking.activitySite}` : ""}・{p.booking.participants ?? 1} 位
                      {p.booking.tripBooked != null ? `（全場 ${p.booking.tripBooked}${p.booking.tripCapacity != null ? `/${p.booking.tripCapacity}` : ""}）` : ""}
                    </div>
                  )}
                  {p.booking.notes && (
                    <div className="mt-0.5 truncate text-[11px] text-amber-700">📝 {p.booking.notes}</div>
                  )}
                  {p.booking.adminNotes && (
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">🔒 {p.booking.adminNotes}</div>
                  )}
                  {p.note && (
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      💳 {p.note}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={acting === p.id}
                  onClick={() => verifyProof(p.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold disabled:opacity-50"
                  style={{ background: "var(--color-ocean-deep)", color: "#fff" }}
                >
                  <Check className="h-3.5 w-3.5" />
                  確認收款
                </button>
                <button
                  type="button"
                  disabled={acting === p.id}
                  onClick={() => rejectProof(p)}
                  className="flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                >
                  <X className="h-3.5 w-3.5" />
                  退回
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && proofs.length === 0 && (
        <div className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有待確認的匯款
        </div>
      )}

      {/* ===== Section 1.5：已下單·待匯款（v674，status=pending 未上傳證明）===== */}
      {pendingUnpaid.length > 0 && (
        <>
          <div className="mb-1.5 mt-5 flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>
              已下單·待匯款（{pendingUnpaid.length}）
            </span>
            <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>尚未上傳付款證明</span>
          </div>
          <div className="space-y-2">
            {pendingUnpaid.map((b) => {
              const refDate = b.ref?.date ?? b.ref?.dateStart;
              const refLabel = b.ref?.title
                ? b.ref.title
                : `${refDate ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
              return (
                <Link
                  key={b.id}
                  href="/admin/m/bookings"
                  className="block rounded-xl border px-3 py-2.5 active:scale-[0.99]"
                  style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{b.user?.realName ?? b.user?.displayName ?? "客戶"}</span>
                    <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: "var(--color-coral)" }}>
                      ${(b.totalAmount ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {b.ref?.title ? "✈️" : "🔱"} {refLabel || "—"}・{b.participants ?? 1} 位
                    {b.code ? `・${b.code}` : ""}
                    <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700">待匯款</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* v680：「待到場確認」已移除（改用獨立「到場點名」/admin/m/attendance），避免與外面重複 */}

      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
    </MobileAdminShell>
  );
}
