import type { Metadata } from "next";
import PosterStudio from "./PosterStudio";

export const metadata: Metadata = {
  title: "潛水行程海報產生器 ‧ 東北角海王子潛水",
  robots: { index: false, follow: false }, // 內部工具，不給 Google 索引
};

// v501：行程海報產生器 — 自動抓後台真實場次(/api/trips + /api/tours)，
//   產生可發社群的月曆海報。支援正方形/限動兩種格式、配色、自訂標題、實拍背景、下載 PNG。
export default function PosterPage() {
  return <PosterStudio />;
}
