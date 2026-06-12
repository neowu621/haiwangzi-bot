import type { MetadataRoute } from "next";

// v494：robots.txt — 允許爬公開行銷頁，擋掉後台 / API / LINE 內部頁；指向 sitemap
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/liff", "/dtest", "/poster", "/pay/", "/t/", "/contract/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
