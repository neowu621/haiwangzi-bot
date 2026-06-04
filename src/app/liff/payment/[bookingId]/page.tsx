"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Upload, Check, X, Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface MyBookingMini {
  id: string;
  type: "daily" | "tour";
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod?: "bank" | "linepay" | "other" | null;  // v289
  ref:
    | { date: string; startTime: string; sites: string[] }
    | { title: string; dateStart: string; dateEnd: string; sites: string[] }
    | null;
  paymentProofs?: Array<{
    id: string;
    type: "deposit" | "final" | "refund";
    amount: number;
    uploadedAt: string;
    verifiedAt: string | null;
    rejectedAt: string | null;
    rejectReason: string | null;
    url: string | null;
  }>;
}

interface Config {
  bank: { name: string; branch: string; account: string; holder: string };
  linepay: { qrUrl: string; liteId: string };  // v289
}

type PayMethod = "bank" | "linepay" | "other";

export default function PaymentUploadPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const liff = useLiff();
  const fileRef = useRef<HTMLInputElement>(null);

  const [booking, setBooking] = useState<MyBookingMini | null>(null);
  const [bank, setBank] = useState<Config["bank"] | null>(null);
  const [linepay, setLinepay] = useState<Config["linepay"] | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false); // v294：避免 bank/linepay 後到造成內容跳動
  const [paymentType, setPaymentType] = useState<"deposit" | "final">(
    (search.get("type") as "deposit" | "final") ?? "deposit",
  );
  const [paymentMethod, setPaymentMethod] = useState<PayMethod | null>(null);  // v289
  const [last5, setLast5] = useState("");
  const [paymentNote, setPaymentNote] = useState("");  // v238：匯款說明 optional
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v240：壓縮中提示
  const [compressing, setCompressing] = useState(false);
  const [origSize, setOrigSize] = useState<number | null>(null);
  const [finalSize, setFinalSize] = useState<number | null>(null);

  useEffect(() => {
    liff
      .fetchWithAuth<{ bookings: MyBookingMini[] }>("/api/bookings/my")
      .then((d) => {
        const b = d.bookings.find((x) => x.id === bookingId);
        if (b) {
          setBooking(b);
          // 日潛沒有訂金概念，直接走「全款」一次性付款
          if (b.type === "daily") setPaymentType("final");
          // v289: 預填上次選的付款方式（如果有）
          if (b.paymentMethod && (b.paymentMethod === "bank" || b.paymentMethod === "linepay" || b.paymentMethod === "other")) {
            setPaymentMethod(b.paymentMethod);
          }
        } else {
          setError("找不到此訂單");
        }
      });
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => { setBank(c.bank); setLinepay(c.linepay); })
      .catch(() => { /* 失敗就 fallback，bank/linepay 保持 null */ })
      .finally(() => setConfigLoaded(true));
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, liff.ready]);

  // v240：迭代壓縮 — 目標 < 500KB
  //   Step 1: 1280px / quality 0.75
  //   Step 2: 1024px / 0.65（若仍 > 500KB）
  //   Step 3: 800px  / 0.6（最後一搏）
  //   任何一階比原檔大就用原檔（已經是高度壓縮的照片）
  async function compressImage(f: File): Promise<File> {
    if (!f.type.startsWith("image/")) return f;
    const TARGET_BYTES = 500 * 1024; // 500KB
    const steps: Array<{ max: number; q: number }> = [
      { max: 1280, q: 0.75 },
      { max: 1024, q: 0.65 },
      { max: 800, q: 0.6 },
    ];

    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      let best: File = f;
      for (const { max, q } of steps) {
        let { width, height } = img;
        if (width > max || height > max) {
          if (width > height) {
            height = Math.round((height * max) / width);
            width = max;
          } else {
            width = Math.round((width * max) / height);
            height = max;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) break;
        ctx.drawImage(img, 0, 0, width, height);
        const blob: Blob | null = await new Promise((res) =>
          canvas.toBlob(res, "image/jpeg", q),
        );
        if (!blob) continue;
        if (blob.size < best.size) {
          best = new File([blob], f.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg",
          });
        }
        if (best.size <= TARGET_BYTES) break;
      }
      return best;
    } catch {
      return f;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setOrigSize(raw.size);
    setFinalSize(null);
    setCompressing(true);
    try {
      const f = await compressImage(raw);
      setFile(f);
      setFinalSize(f.size);
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(f);
    } finally {
      setCompressing(false);
    }
  }

  async function submit() {
    if (!booking) return;
    if (!paymentMethod) {
      setError("請選擇付款方式");
      return;
    }
    // v289：依方式不同驗證必填欄位
    if (paymentMethod === "bank" && !/^\d{5}$/.test(last5)) {
      setError("轉帳付款需填寫匯款帳號後 5 碼（5 位數字）");
      return;
    }
    if (paymentMethod === "linepay" && !file) {
      setError("LINE Pay 付款需上傳轉帳截圖");
      return;
    }
    if (paymentMethod === "other" && !paymentNote.trim()) {
      setError("請說明使用的付款方式（例：街口、微信支付⋯）");
      return;
    }
    setUploading(true);
    setError(null);

    try {
      const expectedAmount =
        paymentType === "deposit"
          ? booking.depositAmount - booking.paidAmount
          : booking.totalAmount - booking.paidAmount;

      // 嘗試 presign → R2 直傳；失敗 → fallback base64（仍 optional）
      let r2Key: string | undefined;
      if (file) {
        try {
          const ctrl1 = new AbortController();
          const t1 = setTimeout(() => ctrl1.abort(), 15000);
          const presign = await liff.fetchWithAuth<{
            url: string;
            key: string;
          }>("/api/uploads/presign", {
            method: "POST",
            body: JSON.stringify({
              prefix: "payments",
              filename: file.name,
              contentType: file.type || "image/jpeg",
            }),
            signal: ctrl1.signal,
          });
          clearTimeout(t1);
          const ctrl2 = new AbortController();
          // v300：R2 PUT 超時 60s（大圖在慢網路會花較久）
          const t2 = setTimeout(() => ctrl2.abort(), 60000);
          const putRes = await fetch(presign.url, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "image/jpeg" },
            signal: ctrl2.signal,
          });
          clearTimeout(t2);
          if (putRes.ok) r2Key = presign.key;
        } catch (e) {
          console.warn("[upload] R2 presign/PUT failed, fallback to base64:", e);
        }
        // Fallback base64 — size guard
        if (!r2Key && preview) {
          const bytes = (preview.length * 0.75);
          if (bytes > 8 * 1024 * 1024) {
            throw new Error(`圖片太大（${Math.round(bytes / 1024 / 1024)}MB）— 請改拍小一點再上傳，或先不附圖只提交後 5 碼`);
          }
        }
      }

      const ctrl3 = new AbortController();
      // v300：拉長到 60s 涵蓋 Zeabur 冷啟動 + LINE WebView 慢網路
      const t3 = setTimeout(() => ctrl3.abort(), 60000);
      try {
        await liff.fetchWithAuth(`/api/bookings/${bookingId}/payment-proofs`, {
          method: "POST",
          body: JSON.stringify({
            type: paymentType,
            amount: expectedAmount,
            paymentMethod,  // v289：必填
            r2Key,
            imageDataUrl: r2Key || !file ? undefined : preview,
            last5: paymentMethod === "bank" ? last5 : undefined,
            note: paymentNote || undefined,
          }),
          signal: ctrl3.signal,
        });
      } finally {
        clearTimeout(t3);
      }
      setUploaded(true);
      setTimeout(() => router.push("/liff/my"), 1500);
    } catch (e) {
      const msg = e instanceof Error
        ? (e.name === "AbortError" ? "上傳超時 — 請檢查網路後再試一次。若反覆失敗請聯絡老闆" : e.message)
        : String(e);
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  // v294：等 booking + config 都載完才顯示內容，避免 bank/linepay 卡片後到造成跳動
  if (!booking || !configLoaded) {
    return (
      <LiffShell title="付款方式選擇" backHref="/liff/my">
        {error ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-coral)]">
            {error}
          </div>
        ) : (
          <LiffLoading variant="bubbles" label="正在載入訂單..." />
        )}
      </LiffShell>
    );
  }

  const expected =
    paymentType === "deposit"
      ? booking.depositAmount - booking.paidAmount
      : booking.totalAmount - booking.paidAmount;

  const isDaily = booking.type === "daily";

  // v297：訂單已完結（已付清 / 已退款 / 已取消）→ 不顯示上傳表單
  const isAlreadyPaid = booking.paymentStatus === "fully_paid" ||
    (booking.totalAmount > 0 && booking.paidAmount >= booking.totalAmount);
  const isRefunded = booking.paymentStatus === "refunded" || booking.paymentStatus === "refunding";
  if (isAlreadyPaid || isRefunded) {
    return (
      <LiffShell title="付款方式選擇" backHref="/liff/my">
        <div className="space-y-4 px-4 pt-6">
          <Card className="bg-[var(--color-phosphor)]/10">
            <CardContent className="p-6 text-center">
              <div className="text-5xl mb-3">{isRefunded ? "↩" : "✅"}</div>
              <div className="text-lg font-bold text-[var(--color-ocean-deep)]">
                {isRefunded ? "此訂單已退款" : "此訂單已付清"}
              </div>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {isRefunded
                  ? "退款流程處理中，無需再付款"
                  : "感謝您的付款，期待見到您！"}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => router.push("/liff/my")}>
                回我的預約
              </Button>
            </CardContent>
          </Card>
        </div>
      </LiffShell>
    );
  }

  return (
    <LiffShell title="付款方式選擇" backHref="/liff/my">
      <div className="space-y-4 px-4 pt-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {isDaily ? "日潛" : "旅遊潛水"}
                </div>
                <div className="mt-1 text-base font-bold">
                  {booking.ref && "title" in booking.ref
                    ? booking.ref.title
                    : booking.ref && "date" in booking.ref
                    ? `${booking.ref.date} ${booking.ref.startTime}`
                    : "—"}
                </div>
              </div>
              <Badge variant="muted" className="tabular">
                {(({ pending: "待付款", deposit_paid: "訂金已付", fully_paid: "已付清", refunding: "退款中", refunded: "已退款" } as Record<string,string>)[booking.paymentStatus] ?? booking.paymentStatus)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* v297：我已上傳的付款證明 — 顯示歷史 + 可刪除未審核 + 顯示駁回理由 */}
        {booking.paymentProofs && booking.paymentProofs.length > 0 && (
          <ProofListCard
            proofs={booking.paymentProofs}
            onDeleted={async (proofId) => {
              await liff.fetchWithAuth(`/api/bookings/${bookingId}/payment-proofs/${proofId}`, { method: "DELETE" });
              // 簡單重新拉一次
              const d = await liff.fetchWithAuth<{ bookings: MyBookingMini[] }>("/api/bookings/my");
              const b = d.bookings.find((x) => x.id === bookingId);
              if (b) setBooking(b);
            }}
          />
        )}

        {/* v289：付款方式選擇 — 3 選 1 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{(booking.paymentProofs?.length ?? 0) > 0 ? "補上傳付款證明" : "選擇付款方式"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["bank", "🏦 轉帳"],
                ["linepay", "💚 LINE Pay"],
                ["other", "📝 其他"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPaymentMethod(k)}
                  className={
                    paymentMethod === k
                      ? "rounded-md border-2 border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 px-2 py-2 text-sm font-bold"
                      : "rounded-md border border-[var(--border)] px-2 py-2 text-sm"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {!paymentMethod && (
              <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                請先選擇付款方式，再依下方指示完成填寫與上傳
              </p>
            )}
          </CardContent>
        </Card>

        {booking.type === "tour" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">付款階段</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType("deposit")}
                  className={`rounded-lg border-2 px-3 py-3 text-center text-sm font-bold ${
                    paymentType === "deposit"
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                      : "border-[var(--border)]"
                  }`}
                  disabled={booking.paidAmount >= booking.depositAmount}
                >
                  訂金
                  <div className="text-xs tabular text-[var(--muted-foreground)]">
                    NT$ {booking.depositAmount.toLocaleString()}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("final")}
                  className={`rounded-lg border-2 px-3 py-3 text-center text-sm font-bold ${
                    paymentType === "final"
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                      : "border-[var(--border)]"
                  }`}
                  disabled={booking.paidAmount < booking.depositAmount}
                >
                  尾款
                  <div className="text-xs tabular text-[var(--muted-foreground)]">
                    NT$ {(booking.totalAmount - booking.depositAmount).toLocaleString()}
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* v289：bank 顯示銀行資訊 + 一鍵複製帳號 */}
        {paymentMethod === "bank" && bank?.account && (
          <Card className="bg-[var(--color-ocean-deep)] text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <Building2 className="h-4 w-4" />
                匯款資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="opacity-70">銀行：</span>
                {bank.name} {bank.branch}
              </div>
              <div>
                <span className="opacity-70">戶名：</span>
                {bank.holder}
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular text-lg font-bold">{bank.account}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(bank.account).then(() => alert("✓ 帳號已複製"))}
                  className="rounded bg-white/20 px-2 py-0.5 text-[10px]"
                >📋 複製</button>
              </div>
              <div className="mt-2 rounded bg-white/10 p-2 text-xs">
                請匯款 <span className="tabular font-bold text-[var(--color-phosphor)]">NT$ {expected.toLocaleString()}</span>，並於下方<b>填寫匯款後 5 碼</b>送出（截圖選填）
              </div>
            </CardContent>
          </Card>
        )}

        {/* v289：linepay 顯示 QR + Lite ID */}
        {paymentMethod === "linepay" && (linepay?.qrUrl || linepay?.liteId) && (
          <Card className="bg-green-50/40 border-green-200">
            <CardHeader>
              <CardTitle className="text-base text-green-900">💚 LINE Pay 轉帳</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {linepay.qrUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={linepay.qrUrl} alt="LINE Pay QR" className="h-44 w-44 rounded border bg-white object-contain mx-auto" />
              )}
              {linepay.liteId && (
                <div className="flex items-center gap-2 text-green-900 justify-center">
                  <span>Lite ID：</span>
                  <span className="font-mono font-bold">{linepay.liteId}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(linepay.liteId).then(() => alert("✓ Lite ID 已複製"))}
                    className="rounded bg-green-600 px-2 py-0.5 text-[10px] text-white"
                  >📋 複製</button>
                </div>
              )}
              <div className="mt-2 rounded bg-green-100 p-2 text-xs text-green-900">
                請轉帳 <span className="tabular font-bold">NT$ {expected.toLocaleString()}</span>，並在下方<b>上傳轉帳成功截圖</b>送出
              </div>
            </CardContent>
          </Card>
        )}

        {/* v289：依付款方式不同顯示不同表單 */}
        {paymentMethod && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">付款證明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* bank：匯款後 5 碼必填（5 位數字） */}
            {paymentMethod === "bank" && (
              <div>
                <Label htmlFor="last5">
                  <span className="text-rose-600">＊</span>您匯款帳號的後 5 碼
                </Label>
                <Input
                  id="last5"
                  inputMode="numeric"
                  maxLength={5}
                  value={last5}
                  onChange={(e) => setLast5(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="必填，5 位數字"
                  className={cn(last5.length > 0 && last5.length !== 5 && "border-rose-500")}
                />
                {last5.length > 0 && last5.length !== 5 && (
                  <p className="mt-1 text-xs text-rose-600">需要剛好 5 位數字</p>
                )}
              </div>
            )}

            {/* 匯款 / LINE Pay 說明（選填）/ other（必填） */}
            <div>
              <Label htmlFor="paymentNote" className={paymentMethod === "other" ? "" : "text-[var(--muted-foreground)]"}>
                {paymentMethod === "other"
                  ? <><span className="text-rose-600">＊</span>請說明您的付款方式</>
                  : "匯款說明（選填）"}
              </Label>
              <textarea
                id="paymentNote"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value.slice(0, 500))}
                placeholder={paymentMethod === "other"
                  ? "例：街口支付、微信支付、現金交付..."
                  : "例：委託家人代匯 / 分兩筆..."}
                rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>

            {/* 截圖：linepay 必填，其他選填 */}
            <div>
              <Label className={paymentMethod === "linepay" ? "" : "text-[var(--muted-foreground)]"}>
                {paymentMethod === "linepay"
                  ? <><span className="text-rose-600">＊</span>轉帳截圖</>
                  : "轉帳截圖（選填）"}
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPick}
              />
              {compressing ? (
                <div className="mt-1 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-phosphor)]/50 bg-[var(--color-phosphor)]/5 text-sm text-[var(--muted-foreground)]">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-phosphor)] border-t-transparent" />
                  <span>正在壓縮圖片...</span>
                </div>
              ) : preview ? (
                <div className="relative mt-1">
                  <img
                    src={preview}
                    alt="轉帳截圖"
                    className="w-full rounded-lg border border-[var(--border)]"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={() => {
                      setPreview(null);
                      setFile(null);
                      setOrigSize(null);
                      setFinalSize(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {origSize && finalSize && (
                    <div className="mt-1 text-center text-[11px] text-[var(--muted-foreground)]">
                      已壓縮：{Math.round(origSize / 1024)} KB → {Math.round(finalSize / 1024)} KB
                      （省 {Math.max(0, Math.round((1 - finalSize / origSize) * 100))}%）
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-1 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]"
                >
                  <Camera className="h-7 w-7" />
                  <span>點此拍照或選擇圖檔（選填）</span>
                  <span className="text-[10px]">會自動壓縮到 &lt; 500 KB</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {uploaded ? (
          <Card className="bg-[var(--color-phosphor)]/20 text-center">
            <CardContent className="p-6">
              <Check className="mx-auto h-10 w-10 text-[var(--color-phosphor)]" />
              <div className="mt-2 font-bold">已送出，等待教練核對</div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="ocean"
            size="lg"
            className="w-full"
            disabled={!paymentMethod
              || (paymentMethod === "bank" && last5.length !== 5)
              || (paymentMethod === "linepay" && !file)
              || (paymentMethod === "other" && !paymentNote.trim())
              || uploading}
            onClick={submit}
          >
            <Upload className="h-4 w-4" />
            {uploading ? (file ? "上傳中..." : "送出中...") : "送出付款證明"}
          </Button>
        )}

        {error && (
          <div className="rounded-lg bg-[var(--color-coral)]/15 p-3 text-sm text-[var(--color-coral)]">
            {error}
          </div>
        )}
      </div>
    </LiffShell>
  );
}

// v297：付款證明列表卡片
interface ProofItem {
  id: string;
  type: "deposit" | "final" | "refund";
  amount: number;
  uploadedAt: string;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  url: string | null;
}
function ProofListCard({
  proofs,
  onDeleted,
}: {
  proofs: ProofItem[];
  onDeleted: (proofId: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆未審核的付款證明嗎？")) return;
    setDeleting(id);
    try {
      await onDeleted(id);
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeleting(null);
    }
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📋 我已上傳的付款證明（{proofs.length}）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {proofs.map((p) => {
          const status: "verified" | "rejected" | "pending" =
            p.verifiedAt ? "verified" : p.rejectedAt ? "rejected" : "pending";
          const statusLabel =
            status === "verified" ? "✅ 已核可"
            : status === "rejected" ? "❌ 審核未通過"
            : "⏳ 審核中";
          const statusColor =
            status === "verified" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
            : status === "rejected" ? "text-rose-700 bg-rose-50 border-rose-200"
            : "text-amber-700 bg-amber-50 border-amber-200";
          return (
            <div key={p.id} className={cn("rounded-lg border p-3 text-sm", statusColor)}>
              <div className="flex items-start gap-3">
                {p.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.url} alt="proof" className="h-16 w-16 object-cover rounded border bg-white" />
                ) : (
                  <div className="h-16 w-16 rounded border bg-white/50 flex items-center justify-center text-[10px] text-gray-400">無圖</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                    {statusLabel}
                    {/* v301：訂金/尾款 標籤 */}
                    {p.type === "deposit" && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">訂金</span>
                    )}
                    {p.type === "final" && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">尾款</span>
                    )}
                    <span>· NT$ {p.amount.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] opacity-80 tabular">
                    {new Date(p.uploadedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {status === "rejected" && p.rejectReason && (
                    <div className="mt-1 rounded bg-white/60 p-1.5 text-[11px]">
                      <span className="font-semibold">老闆說明：</span>{p.rejectReason}
                    </div>
                  )}
                </div>
                {status === "pending" && (
                  <button
                    type="button"
                    disabled={deleting === p.id}
                    onClick={() => handleDelete(p.id)}
                    className="flex-shrink-0 rounded bg-white px-2 py-1 text-[11px] border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deleting === p.id ? "刪除中" : "🗑 刪除"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {proofs.some((p) => p.rejectedAt) && (
          <p className="text-[11px] text-[var(--muted-foreground)] pt-1">
            ⓘ 駁回的證明會保留作為紀錄。您可在下方依老闆說明重新上傳新的證明。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
