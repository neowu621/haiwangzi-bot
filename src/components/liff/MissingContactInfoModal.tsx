"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLiff } from "@/lib/liff/LiffProvider";

/**
 * v269：預約頁缺 phone/email 時的強制補資料 modal
 *
 * 使用方式：父元件在 submit 函數開頭檢查 missing → 開啟此 modal → 客戶儲存後 onSaved 觸發
 *   → 父元件可再呼叫 submit。
 *
 * 客戶按取消（X 或外面）→ booking submit 被中止。
 *
 * 儲存時若 email 是新的或當前未驗證 → 自動 trigger send-verify-email（背景，
 * 不擋下單流程）。
 */
interface Props {
  open: boolean;
  /** 目前缺哪些（影響 UI 顯示） */
  missingEmail: boolean;
  missingPhone: boolean;
  /** 原本已有的值，省得客戶重打 */
  defaultEmail?: string;
  defaultPhone?: string;
  onClose: () => void;
  /** 儲存成功 → 父元件可重新 submit booking */
  onSaved: (data: { email: string; phone: string }) => void;
}

function formatPhone(s: string): string {
  // 台灣手機：09XX-XXX-XXX
  const d = s.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
}

export function MissingContactInfoModal({
  open,
  missingEmail,
  missingPhone,
  defaultEmail = "",
  defaultPhone = "",
  onClose,
  onSaved,
}: Props) {
  const liff = useLiff();
  const [email, setEmail] = React.useState(defaultEmail);
  const [phone, setPhone] = React.useState(defaultPhone);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // open 變動時重置 state（避免關掉再開時還是舊資料）
  React.useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setPhone(defaultPhone);
      setErr(null);
    }
  }, [open, defaultEmail, defaultPhone]);

  const emailValid =
    !missingEmail || (email.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const phoneValid = !missingPhone || phone.replace(/\D/g, "").length >= 8;
  const canSubmit = emailValid && phoneValid && !busy;

  async function save() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.replace(/\D/g, ""); // server 想要純數字

      // 1. PATCH /api/me 儲存補的資料
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...(missingEmail ? { email: trimmedEmail || null } : {}),
          ...(missingPhone ? { phone: trimmedPhone || null } : {}),
        }),
      });

      // 2. 若 email 是新填的（之前空 or 不一樣）→ 背景自動發驗證信
      //    不擋下單流程，失敗只 log
      if (missingEmail && trimmedEmail) {
        void liff
          .fetchWithAuth("/api/me/send-verify-email", { method: "POST" })
          .catch((e) => console.warn("[auto send verify email] failed", e));
      }

      onSaved({ email: trimmedEmail, phone: trimmedPhone });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📋 完成預約前請補填</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          這些資料用於寄送收件通知 + 行前提醒 + 緊急聯絡。沒填無法送出預約。
        </p>

        {missingEmail && (
          <div className="mb-3">
            <Label className="mb-1 block text-xs">
              Email <span className="text-[var(--color-coral)]">*</span>
            </Label>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={email.trim().length > 0 && !emailValid ? "border-[var(--color-coral)]" : ""}
            />
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)] leading-relaxed">
              ✓ 收預約確認 / 行前通知 / 發票<br />
              🎁 驗證後完成首次潛水（到場）可獲 NT$ 100 首潛獎勵（驗證信會自動寄出）
            </p>
          </div>
        )}

        {missingPhone && (
          <div className="mb-3">
            <Label className="mb-1 block text-xs">
              手機 <span className="text-[var(--color-coral)]">*</span>
            </Label>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="09XX-XXX-XXX"
              className={phone.trim().length > 0 && !phoneValid ? "border-[var(--color-coral)]" : ""}
            />
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              ✓ 緊急狀況聯絡用，不會用於行銷
            </p>
          </div>
        )}

        {err && (
          <div className="mb-3 rounded-md bg-[var(--color-coral)]/10 px-3 py-2 text-xs text-[var(--color-coral)]">
            ⚠️ {err}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            onClick={save}
            disabled={!canSubmit}
            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          >
            {busy ? "儲存中..." : "儲存並繼續預約"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
