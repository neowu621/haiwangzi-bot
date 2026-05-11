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
import { useLiff } from "@/lib/liff/LiffProvider";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [bookingId, liff]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!booking || !file || !preview) return;
    setUploading(true);
    setError(null);

    try {
      const expectedAmount =
        paymentType === "deposit"
          ? booking.depositAmount - booking.paidAmount
          : booking.totalAmount - booking.paidAmount;

      // 嘗試 presign → R2 直傳
      let r2Key: string | undefined;
      try {
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
        });
        const putRes = await fetch(presign.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "image/jpeg" },
        });
        if (putRes.ok) r2Key = presign.key;
      } catch {
        // R2 沒設定 → fallback 走 base64
      }

      await liff.fetchWithAuth(`/api/bookings/${bookingId}/payment-proofs`, {
        method: "POST",
        body: JSON.stringify({
          type: paymentType,
          amount: expectedAmount,
          r2Key,
          imageDataUrl: r2Key ? undefined : preview,
          last5: last5 || undefined,
        }),
      });
      setUploaded(true);
      setTimeout(() => router.push("/liff/my"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (!booking) {
    return (
      <LiffShell title="付款上傳" backHref="/liff/my">
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          {error ?? "載入中..."}
        </div>
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
                並於下方上傳轉帳截圖
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">轉帳截圖</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={onPick}
            />
            {preview ? (
              <div className="relative">
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
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]"
              >
                <Camera className="h-8 w-8" />
                <span>點此拍照或選擇圖檔</span>
              </button>
            )}
            <div>
              <Label htmlFor="last5">您匯款帳號的後 5 碼 (協助核對)</Label>
              <Input
                id="last5"
                inputMode="numeric"
                maxLength={8}
                value={last5}
                onChange={(e) => setLast5(e.target.value.replace(/\D/g, ""))}
                placeholder="例: 12345"
              />
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
            disabled={!file || uploading}
            onClick={submit}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "上傳中..." : "送出付款證明"}
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
