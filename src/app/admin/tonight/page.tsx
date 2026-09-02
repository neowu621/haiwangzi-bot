"use client";
import * as React from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { adminFetch, useAdminAuth } from "@/lib/admin-web-auth";
import { memberName } from "@/lib/member-name"; // v1015：暱稱（姓名）
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
    user: { displayName: string; realName: string | null; nickname?: string | null; phone: string | null };
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
  notes?: string | null; // v868：客戶訂單備註（API 用 include，本來就有回傳，只是型別沒宣告）
  creditUsed?: number;
  rentalGear?: GearItem[];
  tankCount?: number | null;
  user: { displayName: string; realName: string | null; nickname?: string | null; phone: string | null };
  ref: { date?: string; startTime?: string; sites?: string[]; title?: string; dateStart?: string; dateEnd?: string; finalDeadline?: string | null; tankCount?: number | null; extraTank?: number; baseTrip?: number; isBoat?: boolean };
  signatureImageUrl?: string | null;
}

// v1070：到場點名的資料型別（沿用 /api/admin/attendance/today）
interface AttBk {
  id: string; name: string; nickname?: string | null; phone: string | null;
  participants: number; status: string; paymentStatus: string; signed: boolean;
  totalAmount: number; paidAmount: number; notes?: string | null; code?: string | null;
}
interface AttSession {
  key: string; type: "daily" | "tour"; label: string; time: string; date: string; bookings: AttBk[];
}

// v1070：待退款判定 —— 與訂單管理同一條規則（取消/未到且仍有現金未退；抵用金會自動退，不算）
const REFUND_PENDING_STATUSES = ["no_show", "cancelled_by_user", "cancelled_by_weather"];
function bookingNeedsRefund(b: { status: string; paymentStatus: string; paidAmount: number; creditUsed?: number }): boolean {
  const cash = b.paidAmount - (b.creditUsed ?? 0);
  return cash > 0
    && b.paymentStatus !== "refunded" && b.paymentStatus !== "refunding"
    && REFUND_PENDING_STATUSES.includes(b.status);
}

// v1070：段落標題 —— 讓「先做什麼」在視覺上有層次，不然十幾個區塊會糊成一片
/**
 * v1076：潛旅尾款繳費期限。後台有填 finalDeadline 就用它，
 * 沒填就退回「出發前 30 天」—— 與 /api/cron/reminders 催尾款用的是同一套規則，
 * 兩邊必須一致，否則畫面說的期限跟客戶收到的通知會對不上。
 */
function finalDueOf(b: { ref?: { finalDeadline?: string | null; dateStart?: string } }): string {
  if (b.ref?.finalDeadline) return b.ref.finalDeadline;
  const ds = b.ref?.dateStart;
  if (!ds) return "";
  const d = new Date(`${ds}T00:00:00+08:00`);
  d.setDate(d.getDate() - 30);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 mb-1 flex items-center gap-2 text-[11px] font-extrabold tracking-wider text-[var(--muted-foreground)]">
      {children}
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
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
  // ── v1070：合併「到場點名」與其他待辦，這頁改名「老闆處理」 ──
  const { adminUser } = useAdminAuth();
  const isBoss = (adminUser?.effectiveRoles ?? []).some((r) => ["boss", "admin", "it"].includes(r));
  const [attSessions, setAttSessions] = React.useState<AttSession[]>([]);
  const [attDate, setAttDate] = React.useState("");
  const [refundReview, setRefundReview] = React.useState<BookingRow[]>([]);   // 客戶申請、待老闆審
  const [refundQuestion, setRefundQuestion] = React.useState<BookingRow[]>([]); // 客戶有疑問
  const [refundAccepted, setRefundAccepted] = React.useState<BookingRow[]>([]); // 已同意、待實際退款
  const [needRefund, setNeedRefund] = React.useState<BookingRow[]>([]);        // 取消/未到仍有現金未退
  // v1076：潛旅尾款待繳（已付訂金、尚欠尾款）—— 原本這頁只看 status=pending，
  //   付完訂金的單 status 已變 confirmed，整批人在這頁完全看不到。
  const [finalPending, setFinalPending] = React.useState<BookingRow[]>([]);
  const [replyCounts, setReplyCounts] = React.useState<{ wishes: number; emails: number }>({ wishes: 0, emails: 0 });
  const toggleDetail = (key: string) => setOpenDetail((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const reload = React.useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      // v400：待確認匯款 + 完整 booking list 改「並行」拉（原本序列，少等一趟）
      // v1070：一次把這頁需要的都拉回來（併行，不多等來回）
      const [proofData, bookingData, attData, liteData] = await Promise.all([
        adminFetch<{ proofs: ProofRow[] }>(`/api/admin/payment-proofs?status=pending`),
        adminFetch<{ bookings: BookingRow[] }>(`/api/admin/bookings`),
        adminFetch<{ date: string; sessions: AttSession[] }>(`/api/admin/attendance/today`).catch(() => ({ date: "", sessions: [] })),
        adminFetch<{ pendingWishes?: number; pendingEmails?: number }>(`/api/admin/stats/lite`).catch(() => ({ pendingWishes: 0, pendingEmails: 0 })),
      ]);
      setAttDate(attData.date ?? "");
      setAttSessions(attData.sessions ?? []);
      setReplyCounts({ wishes: liteData.pendingWishes ?? 0, emails: liteData.pendingEmails ?? 0 });
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

      // v1076：潛旅尾款待繳 —— status 已是 confirmed（訂金付了），所以不在 pendingAll 裡。
      //   出發日已過的不列（那是結案問題，不是催繳問題）。
      setFinalPending(
        allBookings
          .filter(
            (b) =>
              b.type === "tour" &&
              b.status === "confirmed" &&
              b.paymentStatus === "deposit_paid" &&
              b.totalAmount - b.paidAmount > 0 &&
              (b.ref?.dateStart ?? "") >= todayStr,
          )
          .sort((a, b) => (finalDueOf(a) < finalDueOf(b) ? -1 : 1)),
      );

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

      // v1070：退款三桶 —— 客戶在等的排最前面，已同意但錢還沒匯出去的最容易被忘記
      const rrStatus = (b: BookingRow) => (b as { refundRequest?: { status?: string } }).refundRequest?.status;
      setRefundReview(allBookings.filter((b) => rrStatus(b) === "pending_admin").sort(byActivityDate));
      setRefundQuestion(allBookings.filter((b) => rrStatus(b) === "questioning").sort(byActivityDate));
      setRefundAccepted(allBookings.filter((b) => rrStatus(b) === "accepted").sort(byActivityDate));
      setNeedRefund(allBookings.filter(bookingNeedsRefund).sort(byActivityDate));

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

  // v1070：新增的區塊也要納入判斷，否則有退款/點名待辦時仍會顯示「沒有待確認項目」
  const allEmpty = !loading && proofs.length === 0 && orphanAwaitingVerify.length === 0
    && pendingUnpaid.length === 0 && pendingOnsite.length === 0 && pendingCompleted.length === 0
    && attSessions.length === 0 && refundReview.length === 0 && refundQuestion.length === 0
    && refundAccepted.length === 0 && needRefund.length === 0
    && replyCounts.wishes === 0 && replyCounts.emails === 0 && finalPending.length === 0;

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

  // ── v1070：退款相關的列（四種情境共用一個外觀，只有右側動作與底色不同）──
  //   刻意不在這裡重做同意/拒絕的表單：那是 150 行的金流決策 UI，複製兩份一定會漂移。
  //   這裡把「決定所需的資訊」攤開，按鈕直接鎖定該筆訂單開既有介面。
  const renderRefundRow = (b: BookingRow, variant: "review" | "question" | "accepted" | "need") => {
    const rr = (b as { refundRequest?: { amount?: number; method?: string; reason?: string | null; customerNote?: string | null } }).refundRequest;
    const refDate = b.ref?.date ?? b.ref?.dateStart;
    const refLabel = b.ref?.title
      ? b.ref.title
      : `${refDate ?? ""} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
    const cash = b.paidAmount - (b.creditUsed ?? 0);
    const amount = rr?.amount ?? cash;
    const actionLabel = variant === "review" ? "審核" : variant === "question" ? "回覆客戶" : variant === "accepted" ? "去標記完成" : "去退款";
    return (
      <div key={b.id} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="rounded bg-[#e6f6f4] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0a7c7c]">{b.code ?? b.id.slice(0, 8)}</span>
          <button type="button" onClick={() => setOpenCustomerId(b.userId)}
            className="font-semibold underline decoration-dotted underline-offset-2 hover:no-underline">
            {memberName(b.user.nickname, b.user.realName ?? b.user.displayName)}
          </button>
          {b.user.phone && <span className="tabular text-[10px] text-[var(--muted-foreground)]">📞 {b.user.phone}</span>}
          <span className="text-[var(--muted-foreground)]">{refLabel}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--muted-foreground)]">已付 {b.paidAmount.toLocaleString()}</span>
            <span className="tabular-nums font-extrabold" style={{ color: "var(--color-coral)" }}>
              退 {amount.toLocaleString()}{rr?.method === "credit" ? "（抵用金）" : ""}
            </span>
            <Link href={`/admin/bookings?code=${encodeURIComponent(b.code ?? "")}`}>
              <Button size="sm" className="h-7 text-[11px]">{actionLabel}</Button>
            </Link>
          </span>
        </div>
        {/* 客戶為什麼要退 —— 這是決定同意與否的關鍵，攤開來不用點進去 */}
        {(rr?.reason || rr?.customerNote) && (
          <div className="mt-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed"
            style={{ background: "rgba(255,123,90,0.10)", color: "#b3462c" }}>
            📝 {rr.reason}{rr.customerNote ? `　💬 ${rr.customerNote}` : ""}
          </div>
        )}
      </div>
    );
  };

  // ── v1070：到場點名的列（動作沿用既有 attendance API）──
  const renderAttRow = (bk: AttBk) => {
    const done = bk.status === "completed";
    const noShow = bk.status === "no_show";
    const owed = Math.max(0, (bk.totalAmount ?? 0) - (bk.paidAmount ?? 0));
    return (
      <div key={bk.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 text-xs">
        <span className="font-semibold whitespace-nowrap">
          <span style={{ color: "#7c3aed", fontWeight: 800 }}>{bk.nickname?.trim() || "?"}</span>（{bk.name}）
        </span>
        {bk.code && <span className="rounded bg-[#e6f6f4] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0a7c7c]">{bk.code}</span>}
        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px]">{bk.participants}人</span>
        {owed > 0
          ? <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">未付清 {owed.toLocaleString()}</span>
          : <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">付清</span>}
        {bk.signed && <span className="text-[11px]" title="有簽名">✍️</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {done ? (
            <span className="rounded-full bg-green-100 px-3 py-1.5 text-[11px] font-bold text-green-700">✅ 已到場</span>
          ) : noShow ? (
            <button onClick={() => void markAttendance(bk, "completed")} disabled={acting === bk.id}
              className="rounded-full bg-rose-100 px-3 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50">⚠ 未到（改為到場）</button>
          ) : (
            <>
              <Button size="sm" className="h-7 text-[11px]" disabled={acting === bk.id}
                onClick={() => void markAttendance(bk, "completed")}
                style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                <Check className="mr-0.5 h-3 w-3" />到場
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={acting === bk.id}
                onClick={() => void markAttendance(bk, "no_show")}
                style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                <X className="mr-0.5 h-3 w-3" />未到
              </Button>
            </>
          )}
        </span>
        {bk.notes && bk.notes.trim() && (
          <div className="w-full rounded-md px-2.5 py-1.5 text-[13px] font-bold"
            style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>
            📝 訂單備註：{bk.notes}
          </div>
        )}
      </div>
    );
  };

  // v1070：點名動作 —— 沿用既有 API；未付清且有記帳權限會先收現再標到場（與原點名頁同一套規則）
  async function markAttendance(bk: AttBk, action: "completed" | "no_show") {
    const owed = Math.max(0, (bk.totalAmount ?? 0) - (bk.paidAmount ?? 0));
    const settle = action === "completed" && owed > 0 && isBoss;
    const ok = action === "completed"
      ? (owed > 0
          ? confirm(`⚠️ ${bk.name} 尚未付清，剩餘 NT$${owed.toLocaleString()}。

按「確定」＝現場收現並標記到場。
若未收到現金請按「取消」。`)
          : confirm(`確認 ${bk.name} 到場？`))
      : confirm(`確認 ${bk.name} 未到？`);
    if (!ok) return;
    setActing(bk.id);
    try {
      if (settle) {
        await adminFetch(`/api/admin/bookings/${bk.id}/payment-entry`, { method: "POST", body: JSON.stringify({ kind: "cash", amount: owed }) });
      }
      await adminFetch(`/api/coach/bookings/${bk.id}/attendance`, { method: "POST", body: JSON.stringify({ action }) });
      setAttSessions((prev) => prev.map((sx) => ({
        ...sx,
        bookings: sx.bookings.map((x) => (x.id === bk.id
          ? { ...x, status: action, ...(settle ? { paidAmount: x.totalAmount, paymentStatus: "fully_paid" } : {}) }
          : x)),
      })));
      setMsg(action === "completed" ? `✓ ${bk.name} → 到場${settle ? `（現場收現 NT$${owed.toLocaleString()}）` : ""}` : `✓ ${bk.name} → 未到場`);
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

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
              {memberName(b.user.nickname, b.user.realName ?? b.user.displayName)}
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
          {/* v868：訂單備註 —— 樣式對齊「待確認匯款」區，讓老闆在所有待辦區都看得到客戶的特別需求 */}
          {b.notes && b.notes.trim() && (
            <div className="mt-1 rounded-md px-2.5 py-1.5 text-[14px] font-bold" style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>
              📝 訂單備註：{b.notes}
            </div>
          )}
          {/* v868：老闆帳務調整（共乘 +300 等）— 也是老闆要留意的特別收費 */}
          {(() => {
            const adj = (b.priceBreakdown?.bossAdjustments ?? [])
              .map((a) => `${a.label} ${a.amount > 0 ? "+" : "−"}NT$${Math.abs(a.amount).toLocaleString()}`)
              .join("、");
            if (!adj) return null;
            return (
              <div className="mt-1 rounded-md px-2.5 py-1.5 text-[13px] font-bold" style={{ background: "rgba(180,120,10,0.10)", color: "#8a5f10", border: "1px solid rgba(180,120,10,0.30)" }}>
                🧮 帳務調整：{adj}
              </div>
            );
          })()}
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
              {/* v1070：原「老闆結帳」——現在把所有需要處理的事都集中在這頁 */}
              老闆處理與通知
            </h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {isBoss
                ? "所有需要你決定或動手的事，集中在這一頁。由上而下＝該先處理的在前面。"
                : "今日到場名單。點「到場 / 未到」即時記錄。"}
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
                        {memberName(b.user.nickname, b.user.realName ?? b.user.displayName)}
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
              退款、收款、點名、回覆都處理完了。
            </p>
            <Link href="/admin/bookings">
              <Button variant="outline" size="sm" className="mt-4">
                看完整訂單列表
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ===== v1070 ①：有人在等你 —— 客戶送出的退款申請 ===== */}
            {isBoss && refundReview.length > 0 && (
              <section>
                <GroupLabel>① 有人在等你</GroupLabel>
                <div className="overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: "rgba(192,57,43,.35)" }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold" style={{ background: "#fdecea", color: "#c0392b" }}>
                    🔔 客戶申請退款・待審核
                    <span className="ml-auto text-[11.5px] font-semibold">{refundReview.length} 筆</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {refundReview.map((b) => renderRefundRow(b, "review"))}
                  </div>
                </div>
              </section>
            )}
            {isBoss && refundQuestion.length > 0 && (
              <section>
                <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)" }}>
                    ⚠️ 退款方案・客戶有疑問
                    <span className="ml-auto text-[11.5px] font-semibold text-[var(--muted-foreground)]">{refundQuestion.length} 筆</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {refundQuestion.map((b) => renderRefundRow(b, "question"))}
                  </div>
                </div>
              </section>
            )}

            {/* ===== v1070 ②：今天現場要用 —— 到場點名（教練/助教也看得到）===== */}
            {attSessions.length > 0 && (
              <section>
                <GroupLabel>② 今天現場要用</GroupLabel>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-1.5">🐠 到場點名（{attDate || "今日"}）</h2>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    待點 {attSessions.reduce((n, x) => n + x.bookings.filter((k) => k.status === "confirmed").length, 0)}
                  </span>
                </div>
                <div className="space-y-3">
                  {attSessions.map((sess) => (
                    <div key={sess.key} className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                      <div className="border-b px-4 py-2" style={{ borderColor: "var(--border)" }}>
                        <div className="text-[11px] font-semibold" style={{ color: "var(--color-ocean-deep)" }}>📅 {sess.date}</div>
                        <div className="text-sm font-bold">{sess.type === "daily" ? "🔱" : "✈️"} {sess.label}</div>
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {sess.bookings.map((bk) => renderAttRow(bk))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isBoss && <GroupLabel>③ 錢還沒收</GroupLabel>}

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
                            <div className="mt-1 rounded-md px-2.5 py-1.5 text-[14px] font-bold" style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.35)" }}>📝 訂單備註：{p.booking.notes}</div>
                          )}
                          {/* v868：老闆帳務調整（共乘等）— 與「已下單・待匯款」區一致 */}
                          {(() => {
                            const adj = ((p.booking.priceBreakdown as PriceBreakdownData | null)?.bossAdjustments ?? [])
                              .map((a) => `${a.label} ${a.amount > 0 ? "+" : "−"}NT$${Math.abs(a.amount).toLocaleString()}`)
                              .join("、");
                            if (!adj) return null;
                            return (
                              <div className="mt-1 rounded-md px-2.5 py-1.5 text-[13px] font-bold" style={{ background: "rgba(180,120,10,0.10)", color: "#8a5f10", border: "1px solid rgba(180,120,10,0.30)" }}>
                                🧮 帳務調整：{adj}
                              </div>
                            );
                          })()}
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

            {/* ===== v1070 ④：錢還沒退 ===== */}
            {isBoss && (refundAccepted.length > 0 || needRefund.length > 0) && (
              <>
                <GroupLabel>④ 錢還沒退</GroupLabel>
                {refundAccepted.length > 0 && (
                  <section>
                    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)" }}>
                        💸 已同意・待實際退款
                        <span className="ml-auto text-[11.5px] font-semibold text-[var(--muted-foreground)]">{refundAccepted.length} 筆</span>
                      </div>
                      <div className="px-4 py-2 text-[11px] text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                        線上已按同意，但現金還沒實際匯出去 —— 退完記得回訂單標記完成。
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {refundAccepted.map((b) => renderRefundRow(b, "accepted"))}
                      </div>
                    </div>
                  </section>
                )}
                {needRefund.length > 0 && (
                  <section>
                    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)" }}>
                        ⏳ 待退款
                        <span className="ml-auto text-[11.5px] font-semibold text-[var(--muted-foreground)]">{needRefund.length} 筆</span>
                      </div>
                      <div className="px-4 py-2 text-[11px] text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                        訂單已取消或未到場，但客戶付的現金還沒退（抵用金會自動退，不列在這）。
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {needRefund.map((b) => renderRefundRow(b, "need"))}
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ===== v1070 ⑤：等你回覆 ===== */}
            {isBoss && (replyCounts.wishes > 0 || replyCounts.emails > 0) && (
              <>
                <GroupLabel>⑤ 等你回覆</GroupLabel>
                <section className="grid gap-3 sm:grid-cols-2">
                  {replyCounts.wishes > 0 && (
                    <Link href="/admin/dive-wishes" className="rounded-xl border bg-white p-4 transition-colors hover:border-[var(--color-ocean-deep)]" style={{ borderColor: "var(--border)" }}>
                      <div className="text-sm font-bold">📝 待回覆願望單</div>
                      <div className="mt-1 font-mono text-[21px] font-extrabold tabular-nums" style={{ color: "var(--color-ocean-deep)" }}>{replyCounts.wishes}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">客戶想開的團，點進去回覆 →</div>
                    </Link>
                  )}
                  {replyCounts.emails > 0 && (
                    <Link href="/admin/email" className="rounded-xl border bg-white p-4 transition-colors hover:border-[var(--color-ocean-deep)]" style={{ borderColor: "var(--border)" }}>
                      <div className="text-sm font-bold">📧 客服信箱待回覆</div>
                      <div className="mt-1 font-mono text-[21px] font-extrabold tabular-nums" style={{ color: "var(--color-ocean-deep)" }}>{replyCounts.emails}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">有客戶在等回信，點進去處理 →</div>
                    </Link>
                  )}
                </section>
              </>
            )}

            {/* ===== v1076：⑥ 尾款待繳（潛旅：訂金已付、尾款未繳）=====
                 系統會自動催（/api/cron/reminders），這裡是給老闆「看得到全貌」用的：
                 誰還沒繳、期限哪天、逾期了沒。逾期才標紅 —— 未逾期的不需要老闆動作。 */}
            {isBoss && finalPending.length > 0 && (
              <>
                <GroupLabel>⑥ 尾款待繳</GroupLabel>
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-base font-bold flex items-center gap-1.5">
                      🛟 潛旅尾款未繳（{finalPending.length} 筆）
                    </h2>
                    <span className="text-[11px] text-[var(--muted-foreground)]">系統已自動催繳，這裡看全貌 · 逾期標紅</span>
                  </div>
                  <div className="rounded-xl border bg-white divide-y" style={{ borderColor: "var(--border)" }}>
                    {finalPending.map((b) => {
                      const due = finalDueOf(b);
                      const overdue = due !== "" && due < todayStr;
                      const owed = b.totalAmount - b.paidAmount;
                      return (
                        <div key={b.id} className="p-3">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {b.code && (
                              <span className="rounded px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                {b.code}
                              </span>
                            )}
                            <button
                              type="button"
                              className="text-[13px] font-bold underline decoration-dotted underline-offset-2"
                              onClick={() => setOpenCustomerId(b.userId)}
                            >
                              {b.user.realName ?? b.user.displayName}
                              {b.user.nickname ? `（${b.user.nickname}）` : ""}
                            </button>
                            {b.user.phone && (
                              <a href={`tel:${b.user.phone}`} className="text-[12px] text-[var(--muted-foreground)]">📞 {b.user.phone}</a>
                            )}
                            <span className="text-[12.5px]">{b.ref?.title ?? "潛旅"}</span>
                            <span className="text-[11.5px] text-[var(--muted-foreground)]">出發 {b.ref?.dateStart ?? "—"}</span>
                            <span className="ml-auto flex items-center gap-2 text-[12.5px]">
                              <span className="text-[var(--muted-foreground)]">已付訂金 {b.paidAmount.toLocaleString()}</span>
                              <span className="font-bold" style={{ color: "#b3261e" }}>尚欠 {owed.toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-md px-2 py-0.5 text-[11.5px] font-bold"
                              style={
                                overdue
                                  ? { background: "rgba(179,38,30,0.10)", color: "#b3261e", border: "1px solid rgba(179,38,30,0.30)" }
                                  : { background: "var(--muted)", color: "var(--muted-foreground)" }
                              }
                            >
                              {overdue ? "⚠️ 已逾期" : "繳費期限"} {due || "未設定"}
                            </span>
                            <Link href={`/admin/bookings?id=${b.id}`} className="ml-auto">
                              <Button size="sm" variant="outline" className="h-7 text-[11px]">
                                → 訂單管理
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
          🌊 海王子潛水 · 老闆處理與通知
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
