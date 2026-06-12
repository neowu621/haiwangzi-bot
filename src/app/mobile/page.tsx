import type { Metadata } from "next";
import MobileHome from "../_home/MobileHome";

// v504：手機版首頁「預覽」路由。先放這裡給老闆檢視；確認後再接到 `/` 依裝置渲染。
// 預覽階段 noindex（避免與 `/` 重複內容），canonical 指回首頁。
export const metadata: Metadata = {
  title: "東北角海王子潛水（手機版預覽）",
  robots: { index: false, follow: false },
  alternates: { canonical: "/" },
};

export default function MobilePreviewPage() {
  return <MobileHome />;
}
