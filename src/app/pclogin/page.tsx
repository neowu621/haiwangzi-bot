import type { Metadata } from "next";
import { PcLoginApp } from "./PcLoginApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "會員預約 ‧ 東北角海王子潛水",
  description: "桌面版會員預約 — 日潛場次、潛旅行程線上下單",
  robots: { index: false, follow: false }, // v481：測試期間不給搜尋引擎收錄
};

// v481：瀏覽器（桌面）會員下單入口。測試期間放 /pclogin，未來再決定是否併入首頁。
export default function DtestPage() {
  return <PcLoginApp />;
}
