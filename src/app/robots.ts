import type { MetadataRoute } from "next";

// v494：robots.txt — 允許爬公開行銷頁，擋掉後台 / API / LINE 內部頁；指向 sitemap
// v516：補擋 /dev-login（開發身分切換頁，production 已停用但仍可開啟）與 /verify-email-result（一次性驗證結果頁）
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/liff", "/dtest", "/poster", "/mobile", "/dt", "/pay/", "/t/", "/contract/", "/dev-login", "/verify-email-result"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
