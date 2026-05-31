// 客戶端（瀏覽器）Sentry 設定
// 只在 SENTRY_DSN 設定時啟用，未設定時整個 noop
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // 預設只收 10% trace（避免吃免費額度）
    tracesSampleRate: 0.1,
    // 不收 PII（個人身分資訊）
    sendDefaultPii: false,
    // 開發環境不送 Sentry
    enabled: process.env.NODE_ENV === "production",
  });
}
