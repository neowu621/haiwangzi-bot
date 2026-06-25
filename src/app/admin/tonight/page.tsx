"use client";
import * as React from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw, Sun, Moon, ImageIcon, ImageOff } from "lucide-react";
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog"; // v320

/**
 * v298：老闆夜間結帳介面 — 兩段式 + 批次處理
 *
 * Section 1：💰 待確認匯款（payment_proof status=pending）
 *   - 客戶上傳了付款證明還沒審核
 *   - 顯示：客戶 + 金額 + 後5碼 + 截圖縮圖
 *   - 動作：[全部核可勾選] [✓ 核可] [✕ 駁回（填理由）]
 *
 * Section 2：✅ 待確認到場（status=confirmed + 今/昨日）
 *   - 場次已過、付清但還沒勾過到場
 *   - 動作：[全部到場勾選] [✓ 到場] [✕ 未到]
 */

interface ProofRow {
  id: string;
  bookingId: string;
  type: "deposit" | "final" | "refund"; // v301
  amount: number;
  previewUrl: string | null;
  thumb?: string | null;     // v396：DB 縮圖（即時顯示）
  imageKey?: string | null;  // v396：區分「沒上傳圖」與「載入失敗」
  uploadedAt: string;
  last5: string | null;
  note: string | null;
  booking: {
    id: string;
    code: string | null;
    userId: string;
    type?: string;
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
  };
}

interface BookingRow {
  id: string;
  code: string | null;
  userId: string;
  participants: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  paymentStatus: string;
  user: { displayName: string; realName: string | null; phone: string | null };
  ref: { date?: string; startTime?: string; sites?: string[]; title?: string; dateStart?: string };
  signatureImageUrl?: string | null;
}

interface TripGroup {
  key: string;
  type: "daily" | "tour";
  label: string;
  date: string;
  bookings: BookingRow[];
}

export default function TonightPage() {
  const [proofs, setProofs] = React.useState<ProofRow[]>([]);
  const [bookings, setBookings] = React.useState<BookingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [openCustomerId, setOpenCustomerId] = React.useState<string | null>(null); // v320
  // v325：booking.status=awaiting_verify 但無對應 pending PaymentProof
  //   (客戶按了「我已匯款」但跳過附圖、或上傳失敗、或 proof 被駁回後 booking 沒同步)
  const [orphanAwaitingVerify, setOrphanAwaitingVerify] = React.useState<BookingRow[]>([]);
  // v667：已下單但尚未匯款（status=pending，客戶還沒上傳任何付款證明）— 讓老闆知道有單在等收款
  const [pendingUnpaid, setPendingUnpaid] = React.useState<BookingRow[]>([]);
  const [selectedProofs, setSelectedProofs] = React.useState<Set<string>>(new Set());
  const [selectedBookings, setSelectedBookings] = React.useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [imgErrored, setImgErrored] = React.useState<Set<string>>(new Set()); // v396：圖載入失敗的 proof id

  const reload = React.useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      // v400：待確認匯款 + 完整 booking list 改「並行」拉（原本序列，少等一趟）
      const [proofData, bookingData] = await Promise.all([
        adminFetch<{ proofs: ProofRow[] }>(`/api/admin/payment-proofs?status=pending`),
        adminFetch<{ bookings: BookingRow[] }>(`/api/admin/bookings`),
      ]);
      setProofs(proofData.proofs ?? []);
      const allBookings = bookingData.bookings ?? [];

      // 2. 待確認到場（confirmed + 今/昨日）— v306 用台北時區
      const tw = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
      const todayDate = new Date();
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const from = tw(yesterdayDate);
      const to = tw(todayDate);

      const filtered = allBookings.filter((b) => {
        if (b.status !== "confirmed") return false;
        const refDate = b.ref?.date ?? b.ref?.dateStart;
        if (!refDate) return false;
        return refDate >= from && refDate <= to;
      });
      setBookings(filtered);

      // v325：orphan = booking.status=awaiting_verify 但無對應 pending proof
      const proofBookingIds = new Set((proofData.proofs ?? []).map((p) => p.booking.id));
      const orphans = allBookings.filter(
        (b) => b.status === "awaiting_verify" && !proofBookingIds.has(b.id),
      );
      setOrphanAwaitingVerify(orphans);

      // v667：已下單·待匯款 = status pending（尚未上傳付款證明）；近的排前面
      const pending = allBookings
        .filter((b) => b.status === "pending")
        .sort((a, b) => {
          const da = a.ref?.date ?? a.ref?.dateStart ?? "";
          const db = b.ref?.date ?? b.ref?.dateStart ?? "";
          return da < db ? -1 : da > db ? 1 : 0;
        });
      setPendingUnpaid(pending);

      setSelectedProofs(new Set());
      setSelectedBookings(new Set());
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // 場次分組
  const groups: TripGroup[] = React.useMemo(() => {
    const m = new Map<string, TripGroup>();
    for (const b of bookings) {
      const date = b.ref?.date ?? b.ref?.dateStart ?? "?";
      const label = b.ref?.title
        ? b.ref.title
        : `${date} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
      const key = `${date}|${label}`;
      if (!m.has(key)) {
        m.set(key, {
          key,
          type: b.ref?.title ? "tour" : "daily",
          label,
          date,
          bookings: [],
        });
      }
      m.get(key)!.bookings.push(b);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [bookings]);

  // ── Proof actions ────────────────────────────
  async function verifyProof(id: string) {
    setActing(id);
    try {
      await adminFetch(`/api/admin/payment-proofs/${id}/verify`, { method: "POST" });
      setProofs((prev) => prev.filter((p) => p.id !== id));
      setSelectedProofs((s) => { const n = new Set(s); n.delete(id); return n; });
    } catch (e) {
      setMsg("核可失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  async function rejectProof(p: ProofRow) {
    const reason = prompt(`駁回 ${p.booking.user.realName ?? p.booking.user.displayName} 的付款證明 NT$${p.amount}\n\n請填寫駁回原因（將推 LINE 通知客戶）：`);
    if (!reason || !reason.trim()) return;
    setActing(p.id);
    try {
      await adminFetch(`/api/admin/payment-proofs/${p.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setProofs((prev) => prev.filter((x) => x.id !== p.id));
      setSelectedProofs((s) => { const n = new Set(s); n.delete(p.id); return n; });
      setMsg(`✓ 已駁回並通知客戶`);
    } catch (e) {
      setMsg("駁回失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  async function batchVerifyProofs() {
    const ids = Array.from(selectedProofs);
    if (ids.length === 0) return;
    if (!confirm(`確定要核可 ${ids.length} 筆付款證明嗎？\n（會更新訂單狀態為「已付清/已付訂金」）`)) return;
    setActing("batch");
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await adminFetch(`/api/admin/payment-proofs/${id}/verify`, { method: "POST" });
        ok++;
      } catch {
        fail++;
      }
    }
    setMsg(`批次核可完成：${ok} 成功 / ${fail} 失敗`);
    setActing(null);
    void reload();
  }

  // ── Attendance actions ───────────────────────
  async function markAttendance(b: BookingRow, action: "completed" | "no_show") {
    setActing(b.id);
    try {
      await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      setSelectedBookings((s) => { const n = new Set(s); n.delete(b.id); return n; });
      setMsg(`✓ ${b.user.realName ?? b.user.displayName} → ${action === "completed" ? "到場" : "未到場"}`);
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  async function batchMarkAttended() {
    const ids = Array.from(selectedBookings);
    if (ids.length === 0) return;
    if (!confirm(`確定要將 ${ids.length} 位客戶標記為「到場」嗎？\n（會觸發 VIP 升等檢查 + 首單獎勵 + LINE 通知）`)) return;
    setActing("batch");
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await adminFetch(`/api/coach/bookings/${id}/attendance`, {
          method: "POST",
          body: JSON.stringify({ action: "completed" }),
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setMsg(`批次標記完成：${ok} 成功 / ${fail} 失敗`);
    setActing(null);
    void reload();
  }

  const allEmpty = !loading && proofs.length === 0 && groups.length === 0 && orphanAwaitingVerify.length === 0 && pendingUnpaid.length === 0;

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Moon className="h-5 w-5" />
              老闆結帳
            </h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              🧾 已下單·待匯款 ＋ 💰 待確認匯款（不限日期）＋ ✅ 今／昨日 confirmed 待勾到場。可批次處理。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "載入中..." : "重新整理"}
          </Button>
        </div>

        {msg && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>
            {msg}
          </div>
        )}

        {/* v325：booking 標待確認匯款但無證明 — 提示老闆到訂單管理手動處理 */}
        {orphanAwaitingVerify.length > 0 && (
          <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="text-sm font-bold text-amber-900 mb-2">
              ⚠ {orphanAwaitingVerify.length} 筆訂單標記「待確認匯款」但沒有對應的付款證明
            </div>
            <p className="text-xs text-amber-800 mb-2">
              可能原因：客戶按了「我已匯款」但跳過附圖 / 上傳失敗 / 證明被駁回後訂單狀態未同步。
              請手動聯絡客戶補證明、或直接到訂單管理頁手動結算。
            </p>
            <div className="space-y-1.5">
              {orphanAwaitingVerify.map((b) => {
                const refDate = b.ref?.date ?? b.ref?.dateStart;
                const refLabel = b.ref?.title
                  ? b.ref.title
                  : `${refDate ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                        {b.code ?? b.id.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOpenCustomerId(b.userId)}
                        className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                      >
                        {b.user.realName ?? b.user.displayName}
                      </button>
                      {b.user.phone && <span className="text-[10px] text-[var(--muted-foreground)] tabular">📞 {b.user.phone}</span>}
                      <span className="text-[var(--muted-foreground)]">{refLabel}</span>
                      <span className="tabular-nums font-semibold">NT$ {b.totalAmount.toLocaleString()}</span>
                    </div>
                    <Link href={`/admin/bookings?status=awaiting_verify`}>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]">
                        → 至訂單管理處理
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">載入中...</p>
        ) : allEmpty ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
            <Sun className="mx-auto h-10 w-10 text-[var(--muted-foreground)] mb-3" />
            <p className="text-base font-medium">沒有待確認項目 🎉</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              所有匯款都審完了、今日 / 昨日訂單都勾過到場。
            </p>
            <Link href="/admin/bookings">
              <Button variant="outline" size="sm" className="mt-4">
                看完整訂單列表
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ===== Section 0: 已下單·待匯款（v667）===== */}
            {pendingUnpaid.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    🧾 已下單·待匯款（{pendingUnpaid.length} 筆）
                  </h2>
                  <span className="text-[11px] text-[var(--muted-foreground)]">客戶已下單但尚未上傳付款證明</span>
                </div>
                <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                  {pendingUnpaid.map((b) => {
                    const refDate = b.ref?.date ?? b.ref?.dateStart;
                    const refLabel = b.ref?.title
                      ? b.ref.title
                      : `${refDate ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
                    return (
                      <div key={b.id} className="flex items-center justify-between gap-3 p-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-slate-700">
                            {b.ref?.title ? "✈️" : "🔱"} {refLabel || "—"}
                            <span className="ml-1 font-normal text-[var(--muted-foreground)]">· {b.participants} 位</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-sm flex-wrap">
                            <button
                              type="button"
                              onClick={() => setOpenCustomerId(b.userId)}
                              className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                            >
                              {b.user.realName ?? b.user.displayName}
                            </button>
                            <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">
                              {b.code ?? b.id.slice(0, 8)}
                            </span>
                            {b.user.phone && <span className="text-[10px] text-[var(--muted-foreground)] tabular">📞 {b.user.phone}</span>}
                            <span className="font-bold tabular-nums text-[var(--color-coral)]">NT$ {b.totalAmount.toLocaleString()}</span>
                            <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">待匯款</span>
                          </div>
                        </div>
                        <Link href={`/admin/bookings?status=created`}>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]">
                            → 訂單管理催繳
                          </Button>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ===== Section 1: 待確認匯款 ===== */}
            {proofs.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    💰 待確認匯款（{proofs.length} 筆）
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="text-[11px] underline text-[var(--muted-foreground)]"
                      onClick={() => {
                        if (selectedProofs.size === proofs.length) setSelectedProofs(new Set());
                        else setSelectedProofs(new Set(proofs.map((p) => p.id)));
                      }}
                    >
                      {selectedProofs.size === proofs.length ? "取消全選" : "全選"}
                    </button>
                    <Button
                      size="sm"
                      disabled={selectedProofs.size === 0 || acting === "batch"}
                      onClick={batchVerifyProofs}
                      style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      批次核可（{selectedProofs.size}）
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                  {proofs.map((p) => (
                    <div key={p.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedProofs.has(p.id)}
                          onChange={(e) => {
                            const next = new Set(selectedProofs);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setSelectedProofs(next);
                          }}
                          className="mt-1"
                        />
                        {(p.previewUrl || p.thumb) && !imgErrored.has(p.id) ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={p.previewUrl || p.thumb || ""}
                            alt="proof"
                            loading="lazy"
                            className="h-16 w-16 rounded border object-cover cursor-zoom-in"
                            onClick={() => setLightbox(p.previewUrl || p.thumb || null)}
                            onError={() => setImgErrored((s) => new Set(s).add(p.id))}
                          />
                        ) : !p.imageKey ? (
                          // v396：沒上傳圖（現金交付 / 只填後 5 碼）
                          <div className="h-16 w-16 rounded border border-dashed bg-[var(--muted)] flex flex-col items-center justify-center gap-0.5 text-[9px] text-[var(--muted-foreground)]">
                            <ImageOff className="h-4 w-4 opacity-60" />
                            無圖
                          </div>
                        ) : (
                          // 有 key 但載入失敗 / 已清理
                          <div className="h-16 w-16 rounded border bg-[var(--muted)] flex flex-col items-center justify-center gap-0.5 text-[9px] text-[var(--muted-foreground)]">
                            <ImageIcon className="h-4 w-4 opacity-60" />
                            載入失敗
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {/* v667：出團日期/時間/場次 移到最上面（老闆一眼看是哪一場）*/}
                          {(p.booking.activityDate || p.booking.activitySite) && (
                            <div className="text-[12px] font-semibold text-slate-700">
                              🤿 {p.booking.activityDate}{p.booking.activitySite ? `　${p.booking.activitySite}` : ""}
                              {" ・ "}{p.booking.participants ?? 1} 位
                              {p.booking.tripBooked != null && (
                                <span className="ml-1 font-normal text-[var(--muted-foreground)]">（全場 {p.booking.tripBooked}{p.booking.tripCapacity != null ? `/${p.booking.tripCapacity}` : ""}）</span>
                              )}
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center gap-2 text-sm flex-wrap">
                            <button
                              type="button"
                              onClick={() => setOpenCustomerId(p.booking.userId)}
                              className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                            >
                              {p.booking.user.realName ?? p.booking.user.displayName}
                            </button>
                            <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">
                              {p.booking.code ?? p.booking.id.slice(0, 8)}
                            </span>
                            {/* v301：訂金 / 尾款 / 退款 標籤 */}
                            {p.type === "deposit" && (
                              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">訂金</span>
                            )}
                            {p.type === "final" && (
                              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">尾款</span>
                            )}
                            {p.type === "refund" && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">退款</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[12px]">
                            <span className="font-bold text-[var(--color-coral)]">NT$ {p.amount.toLocaleString()}</span>
                            {p.last5 && <span className="ml-2 text-[var(--muted-foreground)]">後5碼 <span className="font-mono">{p.last5}</span></span>}
                          </div>
                          {/* v620：客戶備註 / 管理備註 提醒 */}
                          {p.booking.notes && (
                            <div className="mt-0.5 text-[11px] text-amber-700">📝 客戶：{p.booking.notes}</div>
                          )}
                          {p.booking.adminNotes && (
                            <div className="mt-0.5 text-[11px] text-slate-500">🔒 管理：{p.booking.adminNotes}</div>
                          )}
                        </div>
                        {/* v667：付款方式備註 + 上傳時間/電話 移到右側區塊（核可/駁回上方）*/}
                        <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                          {p.note && (
                            <div className="max-w-[150px] truncate text-[11px] text-[var(--muted-foreground)]" title={p.note}>
                              💳 {p.note}
                            </div>
                          )}
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {new Date(p.uploadedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {p.booking.user.phone ? ` · ${p.booking.user.phone}` : ""}
                          </div>
                          <Button
                            size="sm"
                            disabled={acting === p.id || acting === "batch"}
                            onClick={() => verifyProof(p.id)}
                            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            核可
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === p.id || acting === "batch"}
                            onClick={() => rejectProof(p)}
                            style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            駁回
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Section 2: 待確認到場 ===== */}
            {groups.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    ✅ 待確認到場（{bookings.length} 筆）
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="text-[11px] underline text-[var(--muted-foreground)]"
                      onClick={() => {
                        if (selectedBookings.size === bookings.length) setSelectedBookings(new Set());
                        else setSelectedBookings(new Set(bookings.map((b) => b.id)));
                      }}
                    >
                      {selectedBookings.size === bookings.length ? "取消全選" : "全選"}
                    </button>
                    <Button
                      size="sm"
                      disabled={selectedBookings.size === 0 || acting === "batch"}
                      onClick={batchMarkAttended}
                      style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      批次到場（{selectedBookings.size}）
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.key} className="rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                      <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
                        <p className="text-sm font-bold">
                          {g.type === "daily" ? "🔱" : "✈️"} {g.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                          待勾選 {g.bookings.length} 筆
                        </p>
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {g.bookings.map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-3 p-3">
                            <input
                              type="checkbox"
                              checked={selectedBookings.has(b.id)}
                              onChange={(e) => {
                                const next = new Set(selectedBookings);
                                if (e.target.checked) next.add(b.id);
                                else next.delete(b.id);
                                setSelectedBookings(next);
                              }}
                              className="flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <button
                                  type="button"
                                  onClick={() => setOpenCustomerId(b.userId)}
                                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                                >
                                  {b.user.realName ?? b.user.displayName}
                                </button>
                                <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px]">
                                  {b.participants}人
                                </span>
                                {b.paymentStatus === "fully_paid" ? (
                                  <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">付清</span>
                                ) : (
                                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">未付清</span>
                                )}
                                {b.signatureImageUrl && (
                                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700" title="有簽名">✍️</span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] font-mono">
                                {b.code ?? b.id.slice(0, 8)} · {b.user.phone ?? "—"} · NT$ {b.paidAmount}/{b.totalAmount}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                disabled={acting === b.id || acting === "batch"}
                                onClick={() => markAttendance(b, "completed")}
                                style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" />
                                到場
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === b.id || acting === "batch"}
                                onClick={() => markAttendance(b, "no_show")}
                                style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                              >
                                <X className="mr-1 h-3.5 w-3.5" />
                                未到
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
          🌊 海王子潛水 · 老闆結帳介面
        </p>
      </div>

      {/* 截圖 Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="proof full" className="max-h-[90vh] max-w-full object-contain" />
        </div>
      )}

      {/* v320：全站統一客戶詳情 modal */}
      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />
    </AdminShell>
  );
}
