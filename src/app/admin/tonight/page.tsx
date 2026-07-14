"use client";
import * as React from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw, Sun, Moon, ImageIcon, ImageOff } from "lucide-react";
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog"; // v320
import { PriceBreakdown, type PriceBreakdownData } from "@/components/admin/PriceBreakdown"; // v712

type GearItem = { itemType?: string; price: number; qty?: number };

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
  hasImage?: boolean;        // v722：清單只回有無圖；圖片點選時才載入
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
    priceBreakdown?: PriceBreakdownData | null; // v712
    creditUsed?: number;
    rentalGear?: GearItem[];
    tankCount?: number | null;
    tripExtraTank?: number; tripBaseTrip?: number; tripIsBoat?: boolean; // v716
    user: { displayName: string; realName: string | null; phone: string | null };
  };
}

interface BookingRow {
  id: string;
  code: string | null;
  userId: string;
  type?: "daily" | "tour";
  participants: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null; // v776：客戶選的付款方式（cash=現場支付 → 不催匯款）
  priceBreakdown?: PriceBreakdownData | null; // v712
  creditUsed?: number;
  rentalGear?: GearItem[];
  tankCount?: number | null;
  user: { displayName: string; realName: string | null; phone: string | null };
  ref: { date?: string; startTime?: string; sites?: string[]; title?: string; dateStart?: string; tankCount?: number | null; extraTank?: number; baseTrip?: number; isBoat?: boolean };
  signatureImageUrl?: string | null;
}

export default function TonightPage() {
  const [proofs, setProofs] = React.useState<ProofRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [openCustomerId, setOpenCustomerId] = React.useState<string | null>(null); // v320
  // v325：booking.status=awaiting_verify 但無對應 pending PaymentProof
  //   (客戶按了「我已匯款」但跳過附圖、或上傳失敗、或 proof 被駁回後 booking 沒同步)
  const [orphanAwaitingVerify, setOrphanAwaitingVerify] = React.useState<BookingRow[]>([]);
  // v667：已下單但尚未匯款（status=pending，客戶還沒上傳任何付款證明）— 讓老闆知道有單在等收款
  const [pendingUnpaid, setPendingUnpaid] = React.useState<BookingRow[]>([]);
  // v776：現場付款(cash) 或 活動已過期 的 pending 單 — 不催匯款，改提醒老闆去現場收現／點名／取消
  const [pendingOnsite, setPendingOnsite] = React.useState<BookingRow[]>([]);
  // v776：已到場(completed) 但未付清 — 教練只標到場、款進老闆待辦（要老闆補收現）
  const [pendingCompleted, setPendingCompleted] = React.useState<BookingRow[]>([]);
  // v778：正在「現場收現・結清」的那筆
  const [settling, setSettling] = React.useState<string | null>(null);
  const [selectedProofs, setSelectedProofs] = React.useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [imgLoading, setImgLoading] = React.useState<string | null>(null); // v722：正在載入圖片的 proof id
  // v722：點「匯款」icon 才打單筆 API 取 presigned URL → 開燈箱（清單不再預載圖）
  const openProofImage = React.useCallback(async (proofId: string) => {
    setImgLoading(proofId);
    try {
      const d = await adminFetch<{ proof: { imageUrl: string | null } }>(`/api/admin/payment-proofs/${proofId}`);
      if (d.proof?.imageUrl) setLightbox(d.proof.imageUrl);
      else alert("此筆沒有可顯示的圖片（可能客戶只填後 5 碼，或圖片已清理）");
    } catch (e) {
      alert("載入圖片失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImgLoading(null);
    }
  }, []);
  const [openDetail, setOpenDetail] = React.useState<Set<string>>(new Set()); // v712：展開金額明細的卡片
  const toggleDetail = (key: string) => setOpenDetail((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

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

      // v680：「待確認到場」已移除（改用獨立「到場點名」/admin/attendance），這裡不再算到場名單

      // v325：orphan = booking.status=awaiting_verify 但無對應 pending proof
      const proofBookingIds = new Set((proofData.proofs ?? []).map((p) => p.booking.id));
      const orphans = allBookings.filter(
        (b) => b.status === "awaiting_verify" && !proofBookingIds.has(b.id),
      );
      setOrphanAwaitingVerify(orphans);

      // v776：pending 且「還有錢沒收」才需要老闆處理（已付清但 status 沒同步的不催）。
      //   再分兩流：真的在等匯款 vs 現場付款/活動已過期（後者改走現場收現/點名，不催客戶匯款）。
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      const activityDateOf = (b: BookingRow) => b.ref?.date ?? b.ref?.dateStart ?? "";
      const byActivityDate = (a: BookingRow, b: BookingRow) => {
        const da = activityDateOf(a);
        const db = activityDateOf(b);
        return da < db ? -1 : da > db ? 1 : 0;
      };
      const pendingAll = allBookings.filter(
        (b) => b.status === "pending" && b.totalAmount - b.paidAmount > 0,
      );
      // 現場付款(cash) 或 活動日已過（< 今天，台北時區）→ 不催匯款
      const isOnsiteOrOverdue = (b: BookingRow) => {
        const d = activityDateOf(b);
        return b.paymentMethod === "cash" || (d !== "" && d < todayStr);
      };
      setPendingUnpaid(pendingAll.filter((b) => !isOnsiteOrOverdue(b)).sort(byActivityDate));
      setPendingOnsite(pendingAll.filter(isOnsiteOrOverdue).sort(byActivityDate));

      // v776：已到場但未付清（教練標到場、款未收）→ 提醒老闆補收款。排除退款中/已退。
      setPendingCompleted(
        allBookings
          .filter(
            (b) =>
              b.status === "completed" &&
              b.totalAmount - b.paidAmount > 0 &&
              b.paymentStatus !== "refunded" &&
              b.paymentStatus !== "refunding",
          )
          .sort(byActivityDate),
      );

      setSelectedProofs(new Set());
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

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

  const allEmpty = !loading && proofs.length === 0 && orphanAwaitingVerify.length === 0 && pendingUnpaid.length === 0 && pendingOnsite.length === 0 && pendingCompleted.length === 0;

  // v776：待處理訂單卡片（待匯款 / 現場付款·逾期 共用）
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

  // v778：一鍵「現場收現・結清」＝原子動作，讓付款狀態與訂單狀態一起前進：
  //   ①收現金(kind=cash → paidAmount=total、paymentStatus=fully_paid、paymentMethod=cash)
  //   ②活動日 ≤ 今天且尚未到場 → 一併標到場(status=completed、累積潛數、重算VIP)
  //   兩者做完該筆就離開所有待辦區，不再出現「收了錢卻停在 pending」的不同步。
  const settleOnsite = async (b: BookingRow) => {
    const owed = Math.max(0, b.totalAmount - b.paidAmount);
    const actDate = b.ref?.date ?? b.ref?.dateStart ?? "";
    const willAttend = b.status !== "completed" && actDate !== "" && actDate <= todayStr;
    const name = b.user.realName ?? b.user.displayName;
    const steps: string[] = [];
    if (owed > 0) steps.push(`現場收現 NT$${owed.toLocaleString()}（現金）`);
    if (willAttend) steps.push("標記到場（累積潛數）");
    if (steps.length === 0) { setMsg(`${name} 已結清且已到場，無需處理`); return; }
    if (!window.confirm(`${name}：\n${steps.map((s) => "• " + s).join("\n")}\n\n確認執行？`)) return;
    setSettling(b.id);
    setMsg(null);
    try {
      if (owed > 0) {
        await adminFetch(`/api/admin/bookings/${b.id}/payment-entry`, {
          method: "POST",
          body: JSON.stringify({ kind: "cash", amount: owed }),
        });
      }
      if (willAttend) {
        await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
          method: "POST",
          body: JSON.stringify({ action: "completed" }),
        });
      }
      await reload();
      setMsg(`✓ ${name} → ${owed > 0 ? "已結清" : "已在帳"}${willAttend ? "＋到場" : ""}`);
    } catch (e) {
      setMsg("結清失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSettling(null);
    }
  };

  const renderPendingRow = (b: BookingRow, variant: "transfer" | "onsite" | "attended") => {
    const refDate = b.ref?.date ?? b.ref?.dateStart;
    const refLabel = b.ref?.title
      ? b.ref.title
      : `${refDate ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
    const isCash = b.paymentMethod === "cash";
    const isOverdue = (refDate ?? "") !== "" && (refDate ?? "") < todayStr;
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
            {/* v732：顯示應付 = 總額 − 已付(含抵用金) */}
            <span className="font-bold tabular-nums text-[var(--color-coral)]">NT$ {Math.max(0, b.totalAmount - b.paidAmount).toLocaleString()}</span>
            {(b.creditUsed ?? 0) > 0 && <span className="text-[10px] text-[var(--muted-foreground)]">已折 NT$ {(b.creditUsed ?? 0).toLocaleString()}</span>}
            {variant === "transfer" && (
              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">待匯款</span>
            )}
            {variant === "onsite" && (
              <>
                {isCash && <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">💵 現場付款</span>}
                {isOverdue && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">⏰ 已過期</span>}
              </>
            )}
            {variant === "attended" && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">✅ 已到場・待收款</span>
            )}
          </div>
          <button type="button" onClick={() => toggleDetail(b.id)} className="mt-1 text-[11px] text-[var(--color-ocean-deep)] underline underline-offset-2">
            {openDetail.has(b.id) ? "收起明細 ▴" : "金額明細 ▾"}
          </button>
          {openDetail.has(b.id) && (
            <div className="mt-1.5 rounded-lg bg-[var(--muted)]/50 p-2.5">
              <PriceBreakdown pb={b.priceBreakdown ?? null} fallback={{ type: b.type, totalAmount: b.totalAmount, creditUsed: b.creditUsed, rentalGear: b.rentalGear, tankCount: b.tankCount ?? b.ref?.tankCount, participants: b.participants, extraTank: b.ref?.extraTank, baseTrip: b.ref?.baseTrip, isBoat: b.ref?.isBoat }} />
            </div>
          )}
        </div>
        {variant === "transfer" ? (
          <Link href={`/admin/bookings?status=created`}>
            <Button size="sm" variant="outline" className="h-7 text-[11px]">
              → 訂單管理催繳
            </Button>
          </Link>
        ) : (
          // v778：改為原子動作（收現＋到場一起同步），不再只是連到訂單管理
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={settling === b.id}
            onClick={() => void settleOnsite(b)}
          >
            {settling === b.id ? "處理中…" : "💵 現場收現・結清"}
          </Button>
        )}
      </div>
    );
  };

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
              🧾 已下單·待匯款（未過期·非現場付款）＋ 💵 現場付款/逾期待結案 ＋ ✅ 已到場·未付清 ＋ 💰 待確認匯款（不限日期）。可批次處理。
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
                      {/* v732：顯示應付 = 總額 − 已付(含抵用金) */}
                      <span className="tabular-nums font-semibold">NT$ {Math.max(0, b.totalAmount - b.paidAmount).toLocaleString()}</span>
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
          <div className="flex justify-center py-10"><DiverLoader label="載入中…" size={100} /></div>
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
            {/* ===== Section 0: 已下單·待匯款（v667；v776 排除現場付款/逾期）===== */}
            {pendingUnpaid.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    🧾 已下單·待匯款（{pendingUnpaid.length} 筆）
                  </h2>
                  <span className="text-[11px] text-[var(--muted-foreground)]">未過期 · 非現場付款 · 尚未上傳付款證明</span>
                </div>
                <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                  {pendingUnpaid.map((b) => renderPendingRow(b, "transfer"))}
                </div>
              </section>
            )}

            {/* ===== Section 0b: 現場付款 / 逾期待結案（v776）===== */}
            {pendingOnsite.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    💵 現場付款 / 逾期待結案（{pendingOnsite.length} 筆）
                  </h2>
                  <span className="text-[11px] text-[var(--muted-foreground)]">客戶選現場付款或活動已過期 → 請現場收現／點名，勿催匯款</span>
                </div>
                <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                  {pendingOnsite.map((b) => renderPendingRow(b, "onsite"))}
                </div>
              </section>
            )}

            {/* ===== Section 0c: 已到場・未付清（v776）===== */}
            {pendingCompleted.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">
                    ✅ 已到場・未付清（{pendingCompleted.length} 筆）
                  </h2>
                  <span className="text-[11px] text-[var(--muted-foreground)]">教練已標到場但錢未收 → 請老闆補收現／結清</span>
                </div>
                <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                  {pendingCompleted.map((b) => renderPendingRow(b, "attended"))}
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
                        {/* v722：匯款截圖改 icon，點選才載入 R2 圖片（清單不再預載大圖） */}
                        {p.hasImage ? (
                          <button
                            type="button"
                            onClick={() => openProofImage(p.id)}
                            disabled={imgLoading === p.id}
                            title="點擊查看匯款截圖"
                            className="h-16 w-16 shrink-0 rounded border bg-[var(--muted)] flex flex-col items-center justify-center gap-0.5 text-[9px] text-[var(--color-ocean-deep)] hover:bg-[var(--color-phosphor)]/10 disabled:opacity-50"
                          >
                            <ImageIcon className="h-5 w-5 opacity-70" />
                            {imgLoading === p.id ? "載入中…" : "查看匯款"}
                          </button>
                        ) : (
                          // 沒上傳圖（現金交付 / 只填後 5 碼）
                          <div className="h-16 w-16 shrink-0 rounded border border-dashed bg-[var(--muted)] flex flex-col items-center justify-center gap-0.5 text-[9px] text-[var(--muted-foreground)]">
                            <ImageOff className="h-4 w-4 opacity-60" />
                            無圖
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
                            <span className="text-[var(--muted-foreground)]">客戶填報 </span>
                            <span className="font-bold text-[var(--color-coral)]">NT$ {p.amount.toLocaleString()}</span>
                            {p.last5 && <span className="ml-2 text-[var(--muted-foreground)]">後5碼 <span className="font-mono">{p.last5}</span></span>}
                          </div>
                          <button type="button" onClick={() => toggleDetail(p.id)} className="mt-1 text-[11px] text-[var(--color-ocean-deep)] underline underline-offset-2">
                            {openDetail.has(p.id) ? "收起明細 ▴" : "金額明細（應付組成）▾"}
                          </button>
                          {openDetail.has(p.id) && (
                            <div className="mt-1.5 rounded-lg bg-[var(--muted)]/50 p-2.5">
                              <PriceBreakdown pb={(p.booking.priceBreakdown as PriceBreakdownData | null) ?? null} fallback={{ type: p.booking.type as "daily" | "tour" | undefined, totalAmount: p.booking.totalAmount, creditUsed: p.booking.creditUsed, rentalGear: p.booking.rentalGear, tankCount: p.booking.tankCount, participants: p.booking.participants, extraTank: p.booking.tripExtraTank, baseTrip: p.booking.tripBaseTrip, isBoat: p.booking.tripIsBoat }} />
                            </div>
                          )}
                          {/* v620：客戶備註 / 管理備註 提醒；v850：訂單備註統一紅色標示 */}
                          {p.booking.notes && p.booking.notes.trim() && (
                            <div className="mt-1 rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(220,38,38,0.09)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}>📝 訂單備註：{p.booking.notes}</div>
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
