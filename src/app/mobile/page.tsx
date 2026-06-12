import type { Metadata } from "next";
import MobileHome from "../_home/MobileHome";

// v507：手機真人首頁（proxy 把手機 / 轉向到這裡）。canonical 指回 `/` 集中排名，
//   noindex 避免與 `/` 重複內容（Googlebot 不會被轉來，仍在 `/` 看行動版內容）。
export const metadata: Metadata = {
  title: "東北角海王子潛水 ‧ 萊萊鶯歌石潛水基地 ‧ 汪汪教練",
  description: "東北角潛水首選——汪汪教練帶你安心探索水下世界。免證照體驗潛水、OW/AOW 考證、Fun Dive 練功、東北角潛點與國內外潛旅。",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default function MobilePage() {
  return <MobileHome />;
}
