import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC, Outfit, Inter } from "next/font/google";
import { LiffProvider } from "@/lib/liff/LiffProvider";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
  display: "swap",
});

// v422：首頁標題/英文字 改用 next/font 自架（取代 page.tsx 內 render-blocking 的 Google Fonts <link>）
const notoSerifTc = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "潛水預約系統",
  description: "日潛預約 · 旅遊潛水 · LIFF App",
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
      className={`${notoSansTc.variable} ${notoSerifTc.variable} ${outfit.variable} ${inter.variable}`}
    >
      <body>
        <LiffProvider>{children}</LiffProvider>
      </body>
    </html>
  );
}
