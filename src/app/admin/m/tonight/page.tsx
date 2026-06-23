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
import { Check, X, ExternalLink, ImageOff } from "lucide-react";

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

// 桌機 /admin/tonight 的 booking 形狀（這裡只拿來算「待到場」筆數）
interface BookingRow {
  id: string;
  status: string;
  ref?: { date?: string; dateStart?: string };
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
  const [attendCount, setAttendCount] = useState<number | null>(null);
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
      adminFetch<BookingsResp>(`/api/admin/bookings`),
    ])
      .then(([proofData, bookingData]) => {
        if (!alive) return;
        setProofs(proofData.proofs ?? []);
        // 待到場 = confirmed 且場次落在今/昨日（台北時區），對齊桌機 /admin/tonight
        const tw = (d: Date) =>
          d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const from = tw(yesterday);
        const to = tw(today);
        const count = (bookingData.bookings ?? []).filter((b) => {
          if (b.status !== "confirmed") return false;
          const refDate = b.ref?.date ?? b.ref?.dateStart;
          if (!refDate) return false;
          return refDate >= from && refDate <= to;
        }).length;
        setAttendCount(count);
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
      <div className="mb-3 flex items-center justify-end">
        <Link
          href="/admin/tonight"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          完整管理 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

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

      {/* ===== Section 2：待到場確認（摘要 + 深連桌機）===== */}
      <div className="mb-1.5 mt-5 flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>
          待到場確認
        </span>
      </div>

      <Link
        href="/admin/tonight"
        className="block rounded-xl border px-3 py-2.5 active:scale-[0.99]"
        style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">
            {attendCount === null ? "—" : `${attendCount} 筆`}
            <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--muted-foreground)" }}>
              今／昨日已確認待勾到場
            </span>
          </span>
          <span className="flex flex-shrink-0 items-center gap-1 text-xs" style={{ color: "var(--color-ocean-deep)" }}>
            前往完整結帳 <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </Link>

      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
    </MobileAdminShell>
  );
}
