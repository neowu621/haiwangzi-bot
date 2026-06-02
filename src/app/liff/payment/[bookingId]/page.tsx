"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Upload, Check, X, CreditCard, Building2 } from "lucide-react";
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
  ref:
    | { date: string; startTime: string; sites: string[] }
    | { title: string; dateStart: string; dateEnd: string; sites: string[] }
    | null;
}

interface Config {
  bank: { name: string; branch: string; account: string; holder: string };
}

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
  const [paymentType, setPaymentType] = useState<"deposit" | "final">(
    (search.get("type") as "deposit" | "final") ?? "deposit",
  );
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
        } else {
          setError("找不到此訂單");
        }
      });
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => setBank(c.bank));
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
    // v238：last5 必填且必須是 5 位數字；照片變 optional
    if (!/^\d{5}$/.test(last5)) {
      setError("匯款帳號後 5 碼必須是 5 位數字");
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
          const t2 = setTimeout(() => ctrl2.abort(), 30000);
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
      const t3 = setTimeout(() => ctrl3.abort(), 30000);
      try {
        await liff.fetchWithAuth(`/api/bookings/${bookingId}/payment-proofs`, {
          method: "POST",
          body: JSON.stringify({
            type: paymentType,
            amount: expectedAmount,
            r2Key,
            imageDataUrl: r2Key || !file ? undefined : preview,
            last5,
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
        ? (e.name === "AbortError" ? "上傳超時（30 秒）— 請檢查網路或圖片大小" : e.message)
        : String(e);
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  if (!booking) {
    return (
      <LiffShell title="付款上傳" backHref="/liff/my">
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

  return (
    <LiffShell title={isDaily ? "付款確認" : "付款上傳"} backHref="/liff/my">
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
                {booking.paymentStatus}
              </Badge>
            </div>
            {isDaily && (
              <div className="mt-3 rounded-lg bg-[var(--color-phosphor)]/10 p-2 text-[11px] text-[var(--color-ocean-deep)]">
                日潛採當日付款。可選擇 (A) 現場現金 — 教練收款後核可；或
                (B) 事前匯款並上傳截圖供教練核對。
              </div>
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

        {bank?.account && (
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
              <div className="tabular text-lg font-bold">{bank.account}</div>
              <div className="mt-2 rounded bg-white/10 p-2 text-xs">
                請匯款 <span className="tabular font-bold text-[var(--color-phosphor)]">NT$ {expected.toLocaleString()}</span>，
                並於下方<b>填寫匯款後 5 碼</b>送出（截圖選填）
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">付款證明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 必填：匯款後 5 碼（5 位數字） */}
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
                className={cn(
                  last5.length > 0 && last5.length !== 5 && "border-rose-500",
                )}
              />
              {last5.length > 0 && last5.length !== 5 && (
                <p className="mt-1 text-xs text-rose-600">需要剛好 5 位數字</p>
              )}
            </div>

            {/* 選填：匯款說明 */}
            <div>
              <Label htmlFor="paymentNote" className="text-[var(--muted-foreground)]">
                匯款說明（選填）
              </Label>
              <textarea
                id="paymentNote"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value.slice(0, 500))}
                placeholder="例：使用 LINE Pay 轉帳 / 委託家人代匯 / 分兩筆..."
                rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>

            {/* 選填：轉帳截圖 */}
            <div>
              <Label className="text-[var(--muted-foreground)]">轉帳截圖（選填）</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
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
            disabled={last5.length !== 5 || uploading}
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
