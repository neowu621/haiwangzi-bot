import type { MetadataRoute } from "next";
import { SPOTS } from "./_home/data";

// v494：網站地圖 — 公開可索引頁面。Next.js 自動 serve 於 /sitemap.xml
// v497：補上 /pricing 與每個潛點獨立頁 /dive/[slug]
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/schedule`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/course`, changeFrequency: "monthly", priority: 0.9 },
    ...["discover", "ow", "aow", "private"].map((s) => ({ url: `${base}/guide/${s}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/northsea-diving`, changeFrequency: "monthly", priority: 0.9 },
    ...SPOTS.map((s) => ({ url: `${base}/dive/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${base}/haiwangzi`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/comment`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/safety`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/welcome`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
