// 伺服器端（Node.js runtime）Sentry 設定
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    enabled: process.env.NODE_ENV === "production",
  });
}
