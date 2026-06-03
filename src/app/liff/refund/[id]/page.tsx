"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle } from "lucide-react";

interface RefundRequestData {
  id: string;
  bookingId: string;
  bookingTitle: string;
  method: "cash" | "credit";
  amount: number;
  creditBonusPct: number;
  reason: string | null;
  status: string;
  customerNote: string | null;
  createdAt: string;
  respondedAt: string | null;
  executedAt: string | null;
}

export default function RefundConfirmPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const liff = useLiff();
  const [rr, setRr] = React.useState<RefundRequestData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"accept" | "question" | null>(null);
  const [note, setNote] = React.useState("");
  const [showQuestion, setShowQuestion] = React.useState(false);
  const [resultMsg, setResultMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!params?.id || !liff.ready) return;
    setLoading(true);
    liff
      .fetchWithAuth<{ refundRequest: RefundRequestData }>(`/api/refund-request/${params.id}`)
      .then((d) => setRr(d.refundRequest))
      .catch((e) => setResultMsg("載入失敗：" + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false));
  }, [liff, params?.id]);

  async function respond(action: "accepted" | "questioning") {
    if (!rr) return;
    setBusy(action === "accepted" ? "accept" : "question");
    setResultMsg(null);
    try {
      const r = await liff.fetchWithAuth<{ ok: boolean; executed?: boolean }>(
        `/api/refund-request/${rr.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            note: action === "questioning" ? note : undefined,
          }),
        },
      );
      if (action === "accepted") {
        setResultMsg(
          r.executed
            ? "✓ 已執行：抵用金已存入您的帳戶"
            : "✓ 已接受。店家會儘速處理現金退款。",
        );
      } else {
        setResultMsg("✓ 已通知店家，會儘速與您聯繫");
      }
      // 重抓最新狀態
      try {
        const d = await liff.fetchWithAuth<{ refundRequest: RefundRequestData }>(
          `/api/refund-request/${rr.id}`,
        );
        setRr(d.refundRequest);
      } catch { /* ignore */ }
    } catch (e) {
      setResultMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
      setShowQuestion(false);
    }
  }

  const totalRefund = rr ? rr.amount + Math.floor(rr.amount * (rr.creditBonusPct / 100)) : 0;
  const alreadyResponded = rr && rr.status !== "pending_customer";

  return (
    <LiffShell title="退款確認" backHref="/liff/welcome">
      <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
        {loading ? (
          <p className="text-center text-sm text-[var(--muted-foreground)]">載入中...</p>
        ) : !rr ? (
          <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm">找不到退款申請或您沒有權限查看。</p>
            {resultMsg && <p className="mt-2 text-xs text-[var(--color-coral)]">{resultMsg}</p>}
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="mb-4 rounded-xl border-2 p-4" style={{ borderColor: "var(--color-phosphor)", background: "rgba(0,217,203,0.06)" }}>
              <p className="text-xs text-[var(--muted-foreground)]">💸 退款申請</p>
              <p className="mt-1 text-sm font-medium">{rr.bookingTitle}</p>
            </div>

            {/* 退款資訊 */}
            <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">退款方式</span>
                  <span className="text-sm font-bold text-right">
                    {rr.method === "credit" ? "🎁 抵用金" : "💵 現金退費"}
                    {rr.method === "credit" && rr.creditBonusPct > 0 && (
                      <span className="ml-1 text-[10px] text-[var(--color-phosphor)]">+{rr.creditBonusPct}% 加成</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">退款金額</span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[var(--color-coral)]">NT$ {totalRefund.toLocaleString()}</div>
                    {rr.method === "credit" && rr.creditBonusPct > 0 && (
                      <div className="text-[10px] text-[var(--muted-foreground)]">原 NT$ {rr.amount.toLocaleString()} + 加成 NT$ {(totalRefund - rr.amount).toLocaleString()}</div>
                    )}
                  </div>
                </div>
                {rr.reason && (
                  <div className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                    <p className="mb-1 text-xs text-[var(--muted-foreground)]">退款原因</p>
                    <p className="text-sm whitespace-pre-line">{rr.reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 已回應 → 顯示結果 */}
            {alreadyResponded && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--color-phosphor)", background: "rgba(6,199,85,0.06)" }}>
                <p className="text-sm font-medium">
                  {rr.status === "accepted" && "✓ 您已接受（等待店家執行）"}
                  {rr.status === "executed" && "✓ 退款已完成"}
                  {rr.status === "questioning" && "📞 已通知店家您的疑問"}
                  {rr.status === "cancelled" && "ⓘ 此申請已被店家取消"}
                </p>
                {rr.customerNote && (
                  <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                    您的留言：{rr.customerNote}
                  </p>
                )}
              </div>
            )}

            {/* 未回應 → 顯示動作按鈕 */}
            {!alreadyResponded && !showQuestion && (
              <div className="mt-4 space-y-2">
                <Button
                  size="lg"
                  className="w-full"
                  style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                  disabled={busy !== null}
                  onClick={() => respond("accepted")}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {busy === "accept" ? "處理中..." : "我同意接受退款"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => setShowQuestion(true)}
                  style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                >
                  <AlertTriangle className="mr-1.5 h-4 w-4" />
                  我有疑問
                </Button>
                <p className="mt-3 text-[10px] text-[var(--muted-foreground)] text-center">
                  {rr.method === "credit"
                    ? "點「同意接受」→ 抵用金立即入帳"
                    : "點「同意接受」→ 店家會儘速安排現金退款"}
                </p>
              </div>
            )}

            {/* 疑問留言 */}
            {!alreadyResponded && showQuestion && (
              <div className="mt-4 rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                <p className="mb-2 text-sm font-medium">請說明您的疑問</p>
                <textarea
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                  rows={4}
                  placeholder="例如：金額有疑問 / 想改成現金 / 想保留訂單⋯"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowQuestion(false)} disabled={busy !== null}>
                    取消
                  </Button>
                  <Button
                    className="flex-1"
                    style={{ background: "var(--color-coral)", color: "white" }}
                    onClick={() => respond("questioning")}
                    disabled={busy !== null || note.trim().length < 3}
                  >
                    {busy === "question" ? "送出中..." : "送出疑問"}
                  </Button>
                </div>
              </div>
            )}

            {resultMsg && (
              <div className="mt-4 rounded-md p-3 text-xs text-center" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)" }}>
                {resultMsg}
              </div>
            )}

            <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
              如有任何問題請直接聯繫 LINE 客服。
            </p>
          </>
        )}
      </div>
    </LiffShell>
  );
}
