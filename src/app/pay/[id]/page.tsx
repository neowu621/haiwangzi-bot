"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface BookingPublic {
  id: string;
  code: string;
  type: "daily" | "tour";
  participants: number;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
  paymentMethod: "bank" | "linepay" | "other" | null;
  ref:
    | { date: string; startTime: string; sites: string[] }
    | { title: string; dateStart: string; dateEnd: string; sites: string[] }
    | null;
  createdAt: string;
}

interface PayApiOK {
  state: "active" | "verified";
  booking: BookingPublic;
  bank?: { name: string; branch: string; account: string; holder: string };
  linepay?: { qrUrl: string; liteId: string };
  proofs?: Array<{
    id: string;
    type: string;
    amount: number;
    uploadedAt: string;
    verifiedAt: string | null;
    rejectedAt: string | null;
    rejectReason: string | null;
    last5: string | null;
    note: string | null;
    url: string | null;
  }>;
}

export default function PublicPayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const search = useSearchParams();
  const token = search.get("t") ?? "";

  const [data, setData] = useState<PayApiOK | null>(null);
  const [error, setError] = useState<{ code: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState<"bank" | "linepay" | "other" | null>(null);
  const [last5, setLast5] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError({ code: "no_token", message: "連結缺少安全 token" });
      setLoading(false);
      return;
    }
    fetch(`/api/pay/${id}?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = (await r.json()) as PayApiOK | { error: string; message?: string };
        if (!r.ok) {
          setError({
            code: (j as { error: string }).error ?? "unknown",
            message: (j as { message?: string }).message,
          });
        } else {
          setData(j as PayApiOK);
          // 預填上次選的付款方式
          const pm = (j as PayApiOK).booking.paymentMethod;
          if (pm === "bank" || pm === "linepay" || pm === "other") {
            setPaymentMethod(pm);
          }
        }
      })
      .catch(() => setError({ code: "network", message: "網路錯誤" }))
      .finally(() => setLoading(false));
  }, [id, token]);

  async function compress(f: File): Promise<File> {
    if (!f.type.startsWith("image/")) return f;
    const TARGET = 500 * 1024;
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      let best = f;
      for (const [max, q] of [[1280, 0.75], [1024, 0.65], [800, 0.6]] as const) {
        let { width, height } = img;
        if (width > max || height > max) {
          if (width > height) { height = Math.round((height * max) / width); width = max; }
          else { width = Math.round((width * max) / height); height = max; }
        }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        const ctx = c.getContext("2d"); if (!ctx) break;
        ctx.drawImage(img, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
        if (!blob) continue;
        if (blob.size < best.size) {
          best = new File([blob], f.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        }
        if (best.size <= TARGET) break;
      }
      return best;
    } catch { return f; } finally { URL.revokeObjectURL(url); }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    const f = await compress(raw);
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!data || !paymentMethod) return;
    setSubmitError(null);

    if (paymentMethod === "bank" && !/^\d{5}$/.test(last5)) {
      setSubmitError("匯款帳號後 5 碼必須是 5 位數字");
      return;
    }
    if (paymentMethod === "linepay" && !file) {
      setSubmitError("LINE Pay 付款需上傳轉帳截圖");
      return;
    }
    if (paymentMethod === "other" && !note.trim()) {
      setSubmitError("請說明使用的付款方式");
      return;
    }

    setSubmitting(true);
    try {
      const expected = data.booking.totalAmount - data.booking.paidAmount;
      const body = {
        paymentMethod,
        amount: expected,
        imageDataUrl: preview ?? undefined,
        last5: paymentMethod === "bank" ? last5 : undefined,
        note: note || undefined,
      };
      const r = await fetch(`/api/pay/${id}?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setSubmitError(j.error === "rate_limited" ? "送出過於頻繁，請稍後再試" : j.message ?? j.error ?? "送出失敗");
      } else {
        setSubmitted(true);
      }
    } catch {
      setSubmitError("網路錯誤");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Shell><div className="py-20 text-center text-sm text-gray-500">載入中⋯</div></Shell>;
  }

  // 失效 / 過期 / 已確認等錯誤
  if (error || !data) {
    return (
      <Shell>
        <ErrorView code={error?.code ?? "unknown"} message={error?.message} />
      </Shell>
    );
  }

  // 已被 admin 確認 / 已付清 / 已退款 / 已取消（連結失效，僅檢視）
  if (data.state === "verified") {
    return (
      <Shell>
        <VerifiedView booking={data.booking} reason={(data as PayApiOK & { reason?: string }).reason ?? "verified"} />
      </Shell>
    );
  }

  // v297：永遠顯示 proof 列表 + 上傳表單（不再因為有 pending proof 就強制跳 PendingReview）
  //   讓客戶看到全部歷史 + 駁回理由，可自由刪除未審 / 補上傳

  async function deleteProof(proofId: string) {
    if (!confirm("確定要刪除這筆未審核的付款證明嗎？")) return;
    try {
      const r = await fetch(`/api/pay/${id}/proofs/${proofId}?t=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json();
        alert("刪除失敗：" + (j.error ?? "未知錯誤"));
        return;
      }
      // 重新拉資料
      const r2 = await fetch(`/api/pay/${id}?t=${encodeURIComponent(token)}`);
      const j2 = (await r2.json()) as PayApiOK;
      setData(j2);
    } catch {
      alert("網路錯誤");
    }
  }

  const proofs = data.proofs ?? [];
  const hasPending = proofs.some((p) => !p.verifiedAt && !p.rejectedAt);

  // 一般待付款狀態
  return (
    <Shell>
      <BookingSummary booking={data.booking} />

      {/* v297：付款證明列表（有的話）*/}
      {proofs.length > 0 && (
        <ProofListSection proofs={proofs} onDelete={deleteProof} />
      )}

      {/* 剛送出成功提示 */}
      {(submitted || hasPending) && (
        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⏳ 您有未審核的證明，老闆會盡快處理。如有錯誤可在上方刪除或補上傳。
        </section>
      )}

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold mb-2">選擇付款方式</div>
        <div className="grid grid-cols-3 gap-2">
          {(["bank", "linepay", "other"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={
                paymentMethod === m
                  ? "rounded-md border-2 border-cyan-600 bg-cyan-50 px-2 py-2 text-sm font-bold"
                  : "rounded-md border border-gray-300 px-2 py-2 text-sm hover:bg-gray-50"
              }
            >
              {m === "bank" ? "🏦 轉帳" : m === "linepay" ? "💚 LINE Pay" : "📝 其他"}
            </button>
          ))}
        </div>

        {paymentMethod === "bank" && data.bank?.account && (
          <div className="mt-3 rounded-md bg-blue-50 p-3 text-sm">
            <div className="font-semibold text-blue-900 mb-1">🏦 匯款資訊</div>
            <div className="space-y-0.5 text-blue-900">
              <div>銀行：{data.bank.name} {data.bank.branch}</div>
              <div>戶名：{data.bank.holder}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono font-bold text-base">{data.bank.account}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(data.bank!.account).then(() => alert("✓ 帳號已複製"))}
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white"
                >📋 複製</button>
              </div>
            </div>
          </div>
        )}

        {paymentMethod === "linepay" && (data.linepay?.qrUrl || data.linepay?.liteId) && (
          <div className="mt-3 rounded-md bg-green-50 p-3 text-sm">
            <div className="font-semibold text-green-900 mb-2">💚 LINE Pay</div>
            {data.linepay.qrUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={data.linepay.qrUrl} alt="LINE Pay QR" className="mx-auto h-40 w-40 bg-white border rounded object-contain" />
            )}
            {data.linepay.liteId && (
              <div className="mt-2 flex items-center justify-center gap-2 text-green-900">
                <span className="font-semibold">LINE Pay ID:</span>
                <span className="font-mono font-bold">{data.linepay.liteId}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(data.linepay!.liteId).then(() => alert("✓ LINE Pay ID 已複製"))}
                  className="rounded bg-green-600 px-2 py-0.5 text-xs text-white"
                >📋 複製</button>
              </div>
            )}
            <div className="mt-2 rounded bg-green-100 p-2 text-xs text-green-900 leading-relaxed">
              💚 <b>直接 LINE Pay 給老闆</b>：開啟 LINE Pay → 掃上方 QR 或搜尋上方 ID 轉帳，再上傳轉帳截圖。
            </div>
          </div>
        )}
      </section>

      {paymentMethod && (
        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">填寫付款資訊</div>

          {paymentMethod === "bank" && (
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                <span className="text-rose-600">＊</span> 您匯款帳號後 5 碼
              </label>
              <input
                inputMode="numeric"
                maxLength={5}
                value={last5}
                onChange={(e) => setLast5(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="5 位數字"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-600 block mb-1">
              {paymentMethod === "other"
                ? <><span className="text-rose-600">＊</span> 請說明您的付款方式</>
                : "備註（選填）"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder={paymentMethod === "other" ? "街口支付 / 微信支付 / ..." : "其他補充說明"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">
              {paymentMethod === "linepay"
                ? <><span className="text-rose-600">＊</span> 轉帳截圖</>
                : "截圖（選填）"}
            </label>
            <input type="file" accept="image/*" onChange={onPickFile} className="text-xs" />
            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="預覽" className="mt-2 w-full max-h-60 object-contain rounded border border-gray-200" />
            )}
          </div>

          {submitError && (
            <div className="rounded-md bg-rose-50 p-2 text-sm text-rose-700">
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-md bg-cyan-700 px-4 py-3 text-white font-bold text-sm disabled:opacity-50"
          >
            {submitting ? "送出中⋯" : "💸 送出付款證明"}
          </button>
        </section>
      )}

      <Footer />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-gray-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          <div className="text-2xl">🌊</div>
          <div className="text-lg font-bold text-cyan-900">東北角海王子潛水</div>
        </header>
        {children}
      </div>
    </div>
  );
}

function BookingSummary({ booking }: { booking: BookingPublic }) {
  const remaining = booking.totalAmount - booking.paidAmount;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
        <div className="text-gray-500">訂單編號</div>
        <div className="font-mono font-semibold">{booking.code}</div>
        <div className="text-gray-500">項目</div>
        <div>{booking.type === "daily" ? "日潛" : "旅遊潛水"} ×{booking.participants} 人</div>
        {booking.ref && "date" in booking.ref && (
          <>
            <div className="text-gray-500">場次</div>
            <div className="font-semibold">{booking.ref.date} {booking.ref.startTime}</div>
            {booking.ref.sites.length > 0 && (
              <>
                <div className="text-gray-500">地點</div>
                <div>{booking.ref.sites.join(" · ")}</div>
              </>
            )}
          </>
        )}
        {booking.ref && "title" in booking.ref && (
          <>
            <div className="text-gray-500">標題</div>
            <div className="font-semibold">{booking.ref.title}</div>
            <div className="text-gray-500">日期</div>
            <div>{booking.ref.dateStart} → {booking.ref.dateEnd}</div>
          </>
        )}
      </div>
      <div className="mt-4 border-t border-gray-200 pt-3 flex items-baseline justify-between">
        <span className="text-sm text-gray-500">應付金額</span>
        <span className="text-2xl font-bold text-rose-600 tabular-nums">NT$ {remaining.toLocaleString()}</span>
      </div>
    </section>
  );
}

function VerifiedView({ booking, reason }: { booking: BookingPublic; reason: string }) {
  const isRefunded = reason === "refunded";
  const isCancelled = reason === "cancelled";
  const icon = isRefunded ? "↩" : isCancelled ? "✕" : "✅";
  const title = isRefunded ? "此訂單已退款" : isCancelled ? "此訂單已取消" : "此訂單付款已確認";
  const color = isRefunded ? "border-gray-200" : isCancelled ? "border-rose-200" : "border-emerald-200";
  const textColor = isRefunded ? "text-gray-700" : isCancelled ? "text-rose-700" : "text-emerald-700";
  return (
    <section className={`rounded-lg border ${color} bg-white p-6 text-center`}>
      <div className="text-5xl mb-3">{icon}</div>
      <div className={`text-lg font-bold ${textColor} mb-4`}>{title}</div>
      <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm text-left">
        <div className="text-gray-500">訂單編號</div>
        <div className="font-mono">{booking.code}</div>
        <div className="text-gray-500">項目</div>
        <div>{booking.type === "daily" ? "日潛" : "旅遊潛水"} ×{booking.participants} 人</div>
        <div className="text-gray-500">金額</div>
        <div>NT$ {booking.totalAmount.toLocaleString()}</div>
        <div className="text-gray-500">狀態</div>
        <div className={`${textColor} font-semibold`}>
          {isRefunded ? "↩ 已退款" : isCancelled ? "✕ 已取消" : "✓ 已確認 · ✓ 已付清"}
        </div>
      </div>
      <p className="mt-4 text-xs text-gray-500">詳細資訊請至 LINE 內「我的預約」查看</p>
    </section>
  );
}

function PendingReviewView({ booking }: { booking: BookingPublic }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-white p-6 text-center">
      <div className="text-5xl mb-3">⏳</div>
      <div className="text-lg font-bold text-amber-700 mb-2">付款證明已送出</div>
      <p className="text-sm text-gray-600 mb-4">老闆會在 24 小時內審核完成，<br />審核結果會在 LINE 通知您。</p>
      <div className="text-left grid grid-cols-[80px_1fr] gap-y-1 text-sm border-t border-gray-200 pt-3">
        <div className="text-gray-500">訂單</div>
        <div className="font-mono">{booking.code}</div>
        <div className="text-gray-500">金額</div>
        <div>NT$ {(booking.totalAmount - booking.paidAmount).toLocaleString()}</div>
      </div>
      <p className="mt-4 text-xs text-gray-500">如需重新上傳，可繼續使用此連結。</p>
    </section>
  );
}

function ErrorView({ code, message }: { code: string; message?: string }) {
  const reasons: Record<string, string> = {
    invalid_link: "連結無效",
    expired: "連結已過期（建立超過 30 天）",
    already_verified: "老闆已確認此筆付款",
    no_token: "連結缺少安全 token",
    network: "網路錯誤",
  };
  return (
    <section className="rounded-lg border border-rose-200 bg-white p-6 text-center">
      <div className="text-5xl mb-3">⚠</div>
      <div className="text-lg font-bold text-rose-700 mb-2">
        {message ?? reasons[code] ?? "此連結無法使用"}
      </div>
      <div className="text-sm text-gray-600 mt-3 space-y-1">
        <p>可能原因：</p>
        <ul className="text-left inline-block">
          <li>• 老闆已確認此筆付款</li>
          <li>• 連結超過 30 天有效期</li>
          <li>• 連結網址不正確</li>
        </ul>
      </div>
      <p className="mt-4 text-xs text-gray-500">請至 LINE 內查看訂單，或聯絡老闆。</p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-6 text-center text-xs text-gray-500">
      有問題請聯絡 LINE 官方帳號 @海王子潛水
    </footer>
  );
}

// v297：付款證明列表
type Proof = NonNullable<PayApiOK["proofs"]>[number];
function ProofListSection({
  proofs,
  onDelete,
}: {
  proofs: Proof[];
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold mb-2">📋 我已上傳的付款證明（{proofs.length}）</div>
      <div className="space-y-2">
        {proofs.map((p) => {
          const status: "verified" | "rejected" | "pending" =
            p.verifiedAt ? "verified" : p.rejectedAt ? "rejected" : "pending";
          const label =
            status === "verified" ? "✅ 已核可"
            : status === "rejected" ? "❌ 審核未通過"
            : "⏳ 審核中";
          const color =
            status === "verified" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
            : status === "rejected" ? "text-rose-700 bg-rose-50 border-rose-200"
            : "text-amber-700 bg-amber-50 border-amber-200";
          return (
            <div key={p.id} className={`rounded-md border p-2 text-sm ${color}`}>
              <div className="flex items-start gap-3">
                {p.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.url} alt="proof" className="h-14 w-14 object-cover rounded border bg-white" />
                ) : (
                  <div className="h-14 w-14 rounded border bg-white/50 flex items-center justify-center text-[10px] text-gray-400">無圖</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                    <span>{label}</span>
                    {p.type === "deposit" && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">訂金</span>
                    )}
                    {p.type === "final" && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">尾款</span>
                    )}
                    <span>· NT$ {p.amount.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] opacity-80">
                    {new Date(p.uploadedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {p.last5 ? ` · 後5碼 ${p.last5}` : ""}
                  </div>
                  {status === "rejected" && p.rejectReason && (
                    <div className="mt-1 rounded bg-white/80 p-1.5 text-[11px]">
                      <span className="font-semibold">老闆說明：</span>{p.rejectReason}
                    </div>
                  )}
                </div>
                {status === "pending" && (
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    className="flex-shrink-0 rounded bg-white px-2 py-1 text-[11px] border border-rose-300 text-rose-600"
                  >🗑 刪除</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {proofs.some((p) => p.rejectedAt) && (
        <p className="mt-2 text-[11px] text-gray-500">
          ⓘ 駁回的證明保留作為紀錄。請依老闆說明在下方重新上傳。
        </p>
      )}
    </section>
  );
}
