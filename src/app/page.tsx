import type { Metadata } from "next";
import { headers } from "next/headers";
import DesktopHome from "./_home/DesktopHome";
import MobileHome from "./_home/MobileHome";

// v505：首頁同網址依「裝置」渲染 —— 手機 → MobileHome（App 化）；桌機 / 平板 → DesktopHome。
//   不轉址、維持單一網址 haiwangzi.xyz（SEO 最佳），用 user-agent 判斷在 server 端決定。
//   平板（iPad / Android 平板）視為桌機版。讀 headers() 會讓本頁改為每次請求 server 渲染。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "東北角海王子潛水 ‧ 萊萊鶯歌石潛水基地 ‧ 汪汪教練",
  description: "東北角潛水首選——汪汪教練帶你安心探索水下世界。免證照體驗潛水、OW/AOW 考證、Fun Dive 練功、東北角潛點與國內外潛旅，新手也能安心下水。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "東北角海王子潛水 ‧ 汪汪教練帶你安心潛水",
    description: "體驗潛水・OW/AOW 考證・Fun Dive 練功・東北角潛點與潛旅。新手也能安心下水。",
    url: "/",
  },
};

// 手機判斷：平板（iPad / Android 平板）排除 → 走桌機版
export function isMobileUA(ua: string): boolean {
  if (!ua) return false;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) && !/mobile/.test(s)) return false;
  return /iphone|ipod|windows phone|iemobile|blackberry|bb10|opera mini|(android.*mobile)|mobile.*firefox/.test(s);
}

export default async function HomePage() {
  const ua = (await headers()).get("user-agent") ?? "";
  return isMobileUA(ua) ? <MobileHome /> : <DesktopHome />;
}
