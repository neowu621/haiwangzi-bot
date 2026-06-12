import type { Metadata } from "next";
import DesktopHome from "../_home/DesktopHome";

// v505：桌機 / 平板版「強制預覽」路由（不論裝置都顯示桌機版）。noindex、canonical 指回 `/`。
export const metadata: Metadata = {
  title: "東北角海王子潛水（桌機版預覽）",
  robots: { index: false, follow: false },
  alternates: { canonical: "/" },
};

export default function DesktopPreviewPage() {
  return <DesktopHome />;
}
