"use client";
// 共用「訂單詳細」內容（v734）——「老闆結帳」底部彈窗 + 獨立詳細頁 /admin/m/bookings/[id] 共用。
//   走 /api/admin/m/bookings/[id]；核可/退回沿用既有 payment-proofs verify/reject endpoint。
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { Check, X, Image as ImageIcon, Phone, CalendarDays, Plane } from "lucide-react";

interface Proof {
  id: string;
  type: "deposit" | "final" | "refund";
  amount: number;
  last5: string | null;
  note: string | null;
  hasImage: boolean;
  uploadedAt: string;
  state: "pending" | "verified" | "rejected";
}
interface Booking {
  id: string;
  code: string | null;
  type: "daily" | "tour";
  participants: number;
  customerName: string;
  phone: string | null;
  date: string | null;
  startTime: string | null;
  title: string;
  totalAmount: number;
  paidAmount: number;
  creditUsed: number;
  payable: number;
  paymentStatus: string;
  paymentMethod: string | null;
  status: string;
  statusLabel: string;
  notes: string | null;
  adminNotes: string | null;
}
interface Detail {
  booking: Booking;
  proofs: Proof[];
}

const TYPE_LABEL: Record<string, string> = { deposit: "訂金", final: "尾款", refund: "退款" };
const PROOF_STATE: Record<string, string> = { pending: "⏳ 待核可", verified: "✓ 已核可", rejected: "✕ 已退回" };

// onActed：核可/退回成功後通知父層（讓清單重抓）
export function OrderDetail({ id, onActed }: { id: string; onActed?: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminFetch<Detail>(`/api/admin/m/bookings/${id}`)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const openProofImage = useCallback(async (proofId: string) => {
    setImgLoading(proofId);
    try {
      const d = await adminFetch<{ proof: { imageUrl: string | null } }>(`/api/admin/payment-proofs/${proofId}`);
      if (d.proof?.imageUrl) window.open(d.proof.imageUrl, "_blank", "noopener");
      else alert("此筆沒有可顯示的圖片（可能客戶只填後 5 碼，或圖片已清理）");
    } catch (e) {
      alert("載入圖片失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImgLoading(null);
    }
  }, []);

  async function verifyProof(proofId: string) {
    setActing(proofId);
    setMsg(null);
    try {
      await adminFetch(`/api/admin/payment-proofs/${proofId}/verify`, { method: "POST" });
      invalidateAdminCache("/api/admin/stats");
      setMsg("已確認收款");
      load();
      onActed?.();
    } catch (e) {
      setMsg("確認失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  async function rejectProof(p: Proof) {
    const reason = window.prompt(`退回付款證明 NT$${p.amount.toLocaleString()}\n\n請填寫退回原因（會推 LINE 通知客戶）：`);
    if (!reason || !reason.trim()) return;
    setActing(p.id);
    setMsg(null);
    try {
      await adminFetch(`/api/admin/payment-proofs/${p.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      invalidateAdminCache("/api/admin/stats");
      setMsg("已退回並通知客戶");
      load();
      onActed?.();
    } catch (e) {
      setMsg("退回失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  const b = data?.booking;
  const proofs = data?.proofs ?? [];
  const pendingProofs = proofs.filter((p) => p.state === "pending");
  const needsPayment = !!b && b.paymentStatus !== "fully_paid" && b.paymentStatus !== "refunded" && b.totalAmount > 0;

  if (error) {
    return <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>載入失敗：{error}</div>;
  }
  if (loading && !b) {
    return <div className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>載入中...</div>;
  }
  if (!b) return null;

  return (
    <div className="space-y-3">
      {msg && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(99,235,164,0.12)", color: "#047857" }}>{msg}</div>
      )}

      {/* 客戶 + 場次 */}
      <div className="rounded-xl border p-3.5" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-bold">{b.customerName}</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(10,35,66,0.06)", color: "var(--color-ocean-deep)" }}>{b.statusLabel}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {b.type === "daily" ? <CalendarDays className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
          <span className="truncate">{b.title}{b.date ? `・${b.date}` : ""}{b.startTime ? ` ${b.startTime}` : ""}・{b.participants} 位</span>
        </div>
        {b.code && <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>訂單編號 {b.code}</div>}
        {b.phone && (
          <a href={`tel:${b.phone}`} className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white" style={{ background: "var(--color-ocean-deep)" }}>
            <Phone className="h-4 w-4" /> 打電話給客戶（{b.phone}）
          </a>
        )}
      </div>

      {/* 金額明細 */}
      <div className="rounded-xl border p-3.5" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
        <div className="mb-1.5 text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>金額明細</div>
        <Row k="訂單總額" v={`NT$ ${b.totalAmount.toLocaleString()}`} />
        {b.creditUsed > 0 && <Row k="折抵用金" v={`− NT$ ${b.creditUsed.toLocaleString()}`} />}
        {b.paidAmount > 0 && <Row k="已付（含抵用金）" v={`NT$ ${b.paidAmount.toLocaleString()}`} />}
        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <span className="text-sm font-bold">{needsPayment ? "應付金額" : "已付清"}</span>
          <span className="font-mono text-lg font-extrabold tabular-nums" style={{ color: "var(--color-coral)" }}>
            NT$ {(needsPayment ? b.payable : b.totalAmount).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 付款證明 / 動作 */}
      {proofs.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>付款證明（{proofs.length}）</div>
          {proofs.map((p) => (
            <div key={p.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{TYPE_LABEL[p.type]}・NT$ {p.amount.toLocaleString()}</span>
                <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{PROOF_STATE[p.state]}</span>
              </div>
              {(p.last5 || p.note) && (
                <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {p.last5 ? `後5碼 ${p.last5}` : ""}{p.last5 && p.note ? "・" : ""}{p.note ? `💳 ${p.note}` : ""}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {p.hasImage && (
                  <button type="button" disabled={imgLoading === p.id} onClick={() => openProofImage(p.id)} className="flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--color-ocean-deep)" }}>
                    <ImageIcon className="h-3.5 w-3.5" />{imgLoading === p.id ? "載入中…" : "查看匯款"}
                  </button>
                )}
                {p.state === "pending" && (
                  <>
                    <button type="button" disabled={acting === p.id} onClick={() => verifyProof(p.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--color-ocean-deep)" }}>
                      <Check className="h-3.5 w-3.5" /> 確認收款
                    </button>
                    <button type="button" disabled={acting === p.id} onClick={() => rejectProof(p)} className="flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                      <X className="h-3.5 w-3.5" /> 退回
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {needsPayment && pendingProofs.length === 0 && (
        <div className="rounded-xl border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: "rgba(0,0,0,0.15)", color: "var(--muted-foreground)" }}>
          客戶尚未上傳付款證明，等待匯款中。可先「打電話給客戶」提醒。
        </div>
      )}

      {b.notes && (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(255,184,0,0.1)", color: "#9a7a00" }}>📝 客戶備註：{b.notes}</div>
      )}
      {b.adminNotes && (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(0,0,0,0.04)", color: "var(--muted-foreground)" }}>🔒 管理備註：{b.adminNotes}</div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span style={{ color: "var(--muted-foreground)" }}>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
