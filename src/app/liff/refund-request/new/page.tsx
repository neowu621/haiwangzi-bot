"use client";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function NewRefundRequestContent() {
  const params = useSearchParams();
  const router = useRouter();
  const liff = useLiff();
  const bookingId = params.get("bookingId") ?? "";

  const [booking, setBooking] = React.useState<{
    id: string;
    paidAmount: number;
    type: string;
    title?: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [method, setMethod] = React.useState<"cash" | "credit">("credit");
  const [amount, setAmount] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [resultMsg, setResultMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!bookingId || !liff.ready) return;
    setLoading(true);
    setLoadError(null);
    liff
      .fetchWithAuth<{ bookings: Array<{ id: string; paidAmount: number; type: string; ref?: { date?: string; startTime?: string; title?: string; sites?: string[] } }> }>("/api/bookings/my")
      .then((d) => {
        const b = d.bookings.find((x) => x.id === bookingId);
        if (!b) {
          setLoadError("找不到此訂單，或您沒有權限。");
          return;
        }
        if (b.paidAmount <= 0) {
          setLoadError("此訂單尚未有付款紀錄，無法申請退款。");
          return;
        }
        let title = `預約 #${b.id.slice(0, 8)}`;
        if (b.ref) {
          if (b.type === "daily" && b.ref.date) {
            title = `日潛 ${b.ref.date} ${b.ref.startTime ?? ""}`;
          } else if (b.type === "tour" && b.ref.title) {
            title = b.ref.title;
          }
        }
        setBooking({ id: b.id, paidAmount: b.paidAmount, type: b.type, title });
        // 預設退款金額 = 已付金額
        setAmount(String(b.paidAmount));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bookingId, liff]);

  const amountValid = Number(amount) > 0 && Number(amount) <= (booking?.paidAmount ?? 0);
  const canSubmit = !!booking && amountValid && reason.trim().length >= 3 && !busy;

  async function submit() {
    if (!canSubmit || !booking) return;
    setBusy(true);
    setResultMsg(null);
    try {
      await liff.fetchWithAuth("/api/refund-request/create", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          method,
          amount: Number(amount),
          reason: reason.trim(),
        }),
      });
      setResultMsg("✓ 退款申請已送出。店家審核後會以 LINE 通知您結果。");
      // 3 秒後跳回我的預約
      setTimeout(() => router.push("/liff/my"), 3000);
    } catch (e) {
      setResultMsg("✗ 送出失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LiffShell title="申請退款" backHref="/liff/my">
      <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
        {loading ? (
          <p className="text-center text-sm text-[var(--muted-foreground)]">載入中...</p>
        ) : loadError ? (
          <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--color-coral)" }}>
            <p className="text-sm text-[var(--color-coral)]">{loadError}</p>
            <Button variant="outline" className="mt-3" onClick={() => router.push("/liff/my")}>
              返回我的預約
            </Button>
          </div>
        ) : !booking ? null : (
          <>
            {/* 訂單摘要 */}
            <div className="mb-4 rounded-xl border-2 p-4" style={{ borderColor: "var(--color-phosphor)", background: "rgba(0,217,203,0.06)" }}>
              <p className="text-xs text-[var(--muted-foreground)]">💸 退款申請</p>
              <p className="mt-1 text-sm font-medium">{booking.title}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                已付金額：<b className="text-[var(--foreground)]">NT$ {booking.paidAmount.toLocaleString()}</b>
              </p>
            </div>

            {/* 退款方式 */}
            <div className="mb-4">
              <Label className="mb-2 block text-xs">退款方式 *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["credit", "cash"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`rounded-lg border-2 px-4 py-3 text-sm text-left ${
                      method === m
                        ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <div className="font-bold">{m === "credit" ? "🎁 抵用金" : "💵 現金"}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                      {m === "credit" ? "立即入帳，下次預約可折抵" : "店家匯回原帳戶 / 現金"}
                    </div>
                  </button>
                ))}
              </div>
              {method === "credit" && (
                <p className="mt-2 text-[10px] text-[var(--color-phosphor)]">
                  ✨ 若為天氣或店家原因取消，店家可能會額外加成（如 +10% 抵用金）
                </p>
              )}
            </div>

            {/* 退款金額 */}
            <div className="mb-4">
              <Label className="mb-1 block text-xs">退款金額 *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">NT$</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1"))}
                  className="pl-12"
                  placeholder={String(booking.paidAmount)}
                />
              </div>
              <div className="mt-1 flex gap-2 text-[11px]">
                <button type="button" onClick={() => setAmount(String(booking.paidAmount))}
                  className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[var(--muted-foreground)] hover:bg-[var(--border)]">
                  全部 NT$ {booking.paidAmount.toLocaleString()}
                </button>
                <button type="button" onClick={() => setAmount(String(Math.floor(booking.paidAmount / 2)))}
                  className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[var(--muted-foreground)] hover:bg-[var(--border)]">
                  半額
                </button>
              </div>
              {amount && !amountValid && (
                <p className="mt-1 text-[10px] text-[var(--color-coral)]">
                  退款金額需大於 0 且不超過已付金額 NT$ {booking.paidAmount.toLocaleString()}
                </p>
              )}
            </div>

            {/* 原因 */}
            <div className="mb-4">
              <Label className="mb-1 block text-xs">退款原因 * <span className="text-[var(--muted-foreground)]">（至少 3 字）</span></Label>
              <textarea
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                rows={4}
                placeholder="例如：天氣不佳改期、突然不能參加、健康因素⋯"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <Button
              size="lg"
              className="w-full"
              style={{ background: "var(--color-coral)", color: "white" }}
              disabled={!canSubmit}
              onClick={submit}
            >
              {busy ? "送出中..." : "送出退款申請"}
            </Button>

            {resultMsg && (
              <div className={`mt-4 rounded-md p-3 text-xs text-center ${resultMsg.startsWith("✓")
                ? "bg-[var(--color-phosphor)]/10 text-[var(--color-phosphor)]"
                : "bg-[var(--color-coral)]/10 text-[var(--color-coral)]"}`}>
                {resultMsg}
              </div>
            )}

            <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
              送出後店家會在 1-3 個工作天內審核。<br />
              如急件請另外聯繫客服。
            </p>
          </>
        )}
      </div>
    </LiffShell>
  );
}

export default function NewRefundRequestPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center">載入中…</div>}>
      <NewRefundRequestContent />
    </Suspense>
  );
}
