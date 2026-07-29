import type { Metadata } from "next";
import DesktopHome from "../_home/DesktopHome";

// v950：完整版首頁 —— 不看裝置一律渲染 DesktopHome（響應式，手機也能看完整內容）。
//   手機精簡首頁的「看完整介紹」連到這裡。canonical 指回 `/`、noindex 避免重複內容。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "東北角海王子潛水 ‧ 完整介紹",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default function FullHomePage() {
  return <DesktopHome />;
}
