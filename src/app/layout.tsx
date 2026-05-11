import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Inter } from "next/font/google";
import { LiffProvider } from "@/lib/liff/LiffProvider";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "東北角海王子潛水團",
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
      className={`${notoSansTc.variable} ${inter.variable}`}
    >
      <body>
        <LiffProvider>{children}</LiffProvider>
      </body>
    </html>
  );
}
