// v311：首次進入 LIFF 強制 Onboarding Modal
// 必填：真實姓名 / 電話 / Email
// 完成後寫 user.onboardingCompletedAt + 自動寄驗證信
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiff } from "@/lib/liff/LiffProvider";

interface OnboardingModalProps {
  open: boolean;
  /** 完成後呼叫，父元件可重新 fetch /api/me 確認狀態 */
  onComplete: () => void;
  defaultRealName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
}

export function OnboardingModal({
  open,
  onComplete,
  defaultRealName,
  defaultPhone,
  defaultEmail,
}: OnboardingModalProps) {
  const liff = useLiff();
  const [realName, setRealName] = useState(defaultRealName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    realName.trim().length >= 2 &&
    /^[0-9+\-\s]{8,}$/.test(phone.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSubmit() {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1. 更新 user 資料 + 標記 onboarding 完成
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          realName: realName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          markOnboardingComplete: true,
        }),
      });
      // 2. 自動寄驗證信
      try {
        await liff.fetchWithAuth("/api/me/send-verify-email", {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        });
      } catch (e) {
        console.warn("[onboarding] send-verify-email failed (continuing)", e);
      }
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open}>
      {/* 不允許關閉：不傳 onOpenChange */}
      <DialogContent
        className="max-w-md"
        // 禁止 ESC / 外部點擊關閉
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // 隱藏右上角 X
        onPointerDownCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-dialog-close]")) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>🌊 歡迎加入海王子潛水！</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[var(--muted-foreground)]">
            為了提供最佳服務，請先完成基本資料。資料只用於訂單聯絡與必要通知。
          </p>

          <div>
            <Label htmlFor="ob-name">
              <span className="text-rose-600">＊</span>真實姓名
            </Label>
            <Input
              id="ob-name"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="王小明"
              maxLength={50}
            />
          </div>

          <div>
            <Label htmlFor="ob-phone">
              <span className="text-rose-600">＊</span>手機號碼
            </Label>
            <Input
              id="ob-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912-345-678"
              maxLength={20}
            />
          </div>

          <div>
            <Label htmlFor="ob-email">
              <span className="text-rose-600">＊</span>Email
            </Label>
            <Input
              id="ob-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              maxLength={254}
            />
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              送出後會自動寄驗證信，請點信內連結完成 Email 驗證。
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "送出中..." : "✓ 完成註冊"}
          </Button>

          <p className="text-[10px] text-center text-[var(--muted-foreground)]">
            完成後才能瀏覽訂位與我的預約等功能
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
