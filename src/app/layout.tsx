import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
import "./globals.css";

// v428：載入優化 — 移除「Noto Serif TC（CJK 明體，render-blocking 字體 CSS 大宗）」與
//   全站未使用的 Inter；Noto Sans TC 字重 6→4（砍 300/600，faux 合成可接受）。
//   首頁標題改用黑體（home.css 的 --serif 重新指向 --font-noto-tc）。
const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// v497：metadataBase 讓各頁 canonical / OG 相對網址解析成絕對網址；補預設 OG 分享圖
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz"),
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "潛水預約系統",
  description: "日潛預約 · 旅遊潛水 · LIFF App",
  openGraph: {
    type: "website",
    siteName: "東北角海王子潛水",
    images: ["/home/src-hero.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0A2342",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${notoSansTc.variable} ${outfit.variable}`}
    >
      <body>
        {/* v423：LiffProvider 已下放到 src/app/liff/layout.tsx，公開頁不再背 LIFF client JS */}
        {children}
      </body>
    </html>
  );
}
