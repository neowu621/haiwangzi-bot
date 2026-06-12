import type { Metadata } from "next";
import { headers } from "next/headers";
import DesktopHome from "./_home/DesktopHome";
import MobileHome from "./_home/MobileHome";
import { isMobileUA } from "@/lib/ua";

// v505：首頁同網址依「裝置」渲染 —— 手機 → MobileHome（App 化）；桌機 / 平板 → DesktopHome。
//   不轉址、維持單一網址 haiwangzi.xyz（SEO 最佳），用 user-agent 判斷在 server 端決定。
//   平板（iPad / Android 平板）視為桌機版。讀 headers() 會讓本頁改為每次請求 server 渲染。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "東北角海王子潛水 ‧ 萊萊鶯歌石水肺潛水基地 ‧ 汪汪教練",
  description: "東北角水肺潛水（scuba）首選——汪汪教練帶你安心探索水下世界。免證照體驗潛水、OW/AOW 考證、Fun Dive 練功，龍洞、潮境等東北角潛點與國內外潛旅，新手也能安心下水。",
  keywords: ["東北角潛水", "水肺潛水", "scuba", "龍洞潛水", "潮境潛水", "體驗潛水", "OW 考照", "東北角 潛水教練"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "東北角海王子潛水 ‧ 汪汪教練帶你安心潛水",
    description: "水肺潛水 scuba・體驗潛水・OW/AOW 考證・Fun Dive 練功・龍洞潮境等東北角潛點與潛旅。新手也能安心下水。",
    url: "/",
  },
};

// 桌機/平板 → DesktopHome。手機真人已由 proxy.ts 在 / 轉向 /mobile；
// 會走到這裡的手機 UA 多半是爬蟲（如 Googlebot 行動版），仍渲染 MobileHome 配合行動優先索引。
export default async function HomePage() {
  const ua = (await headers()).get("user-agent") ?? "";
  return isMobileUA(ua) ? <MobileHome /> : <DesktopHome />;
}
