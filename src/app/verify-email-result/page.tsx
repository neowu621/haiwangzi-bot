"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * v256：Email 驗證結果頁
 *
 * /api/verify-email 處理完後 redirect 到這裡，根據 ?status= 顯示不同畫面。
 *
 * status 列表：
 *   ok           — 驗證成功
 *   missing      — 沒帶 token
 *   invalid      — token 不存在
 *   already_used — 已用過
 *   expired      — 過期（7 天 TTL）
 *   user_gone    — User 不存在（不太可能，除非帳號被刪）
 *   email_changed — User 後來改了 email，token 失效
 */
function ResultContent() {
  const params = useSearchParams();
  const status = params.get("status") ?? "missing";
  const email = params.get("email") ?? "";

  type DisplayEntry = {
    icon: string;
    iconColor: string;
    title: string;
    message: string;
    hint: string;
    cta: string;
  };
  const TABLE: Record<string, DisplayEntry> = {
    ok: {
      icon: "✓",
      iconColor: "#06C755",
      title: "Email 驗證成功！",
      message: `${email ? email + " " : ""}已驗證完成。`,
      hint: "🎁 完成個人資料 + 首單完成後，隔日系統自動發放 100 元抵用金（限 30 天內使用）。",
      cta: "回到預約 App",
    },
    missing: {
      icon: "❌",
      iconColor: "#FF7B5A",
      title: "驗證連結錯誤",
      message: "此連結缺少必要參數，無法驗證。",
      hint: "請重新從 Email 信件中點擊驗證連結，或從預約 App 中重新發送驗證信。",
      cta: "回到預約 App",
    },
    invalid: {
      icon: "❌",
      iconColor: "#FF7B5A",
      title: "驗證連結無效",
      message: "找不到此驗證 token。",
      hint: "可能原因：連結被截斷、複製不完整，或您已使用過此連結。請從 LIFF App 重新發送驗證信。",
      cta: "回到預約 App",
    },
    already_used: {
      icon: "✓",
      iconColor: "#06C755",
      title: "已驗證過",
      message: "此 Email 已經完成驗證，無需重複操作。",
      hint: "您可以直接使用預約 App 的所有功能。",
      cta: "回到預約 App",
    },
    expired: {
      icon: "⌛",
      iconColor: "#FFB800",
      title: "連結已過期",
      message: "此驗證連結已超過 7 天有效期。",
      hint: "請從 LIFF App 重新發送驗證信。",
      cta: "回到預約 App",
    },
    user_gone: {
      icon: "❌",
      iconColor: "#FF7B5A",
      title: "找不到帳號",
      message: "對應的會員資料不存在。",
      hint: "若您剛刪除帳號又想恢復，請聯絡客服。",
      cta: "回到首頁",
    },
    email_changed: {
      icon: "⚠️",
      iconColor: "#FFB800",
      title: "Email 已變更",
      message: "您 Email 已經改成別的地址，此驗證連結不再有效。",
      hint: "請使用最新 Email 重新發送驗證信。",
      cta: "回到預約 App",
    },
  };
  const display: DisplayEntry =
    TABLE[status] ?? {
      icon: "❌",
      iconColor: "#FF7B5A",
      title: "未知狀態",
      message: `status=${status}`,
      hint: "請聯絡客服。",
      cta: "回到預約 App",
    };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] px-6 py-10 text-center">
      <div
        className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full text-4xl"
        style={{ background: `${display.iconColor}22`, color: display.iconColor }}
      >
        {display.icon}
      </div>

      <h1 className="mb-2 text-xl font-bold text-[var(--foreground)]">
        {display.title}
      </h1>
      <p className="mb-3 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
        {display.message}
      </p>

      {display.hint && (
        <div
          className="mb-6 max-w-sm rounded-lg border-l-4 px-4 py-3 text-left text-xs leading-relaxed text-[var(--foreground)]"
          style={{
            borderColor: display.iconColor,
            background: `${display.iconColor}10`,
          }}
        >
          {display.hint}
        </div>
      )}

      <a
        href="/liff/welcome"
        className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white shadow-lg transition-transform active:scale-95"
        style={{ background: "#06C755" }}
      >
        {display.cta}
      </a>
    </div>
  );
}

export default function VerifyEmailResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          載入中…
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
