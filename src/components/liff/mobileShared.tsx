// v697：m2 風格的共用色盤/小元件,供 LIFF 首頁、訊息通知沿用 m2 觀感(不動 m2 本體)。
import * as React from "react";

export const C = {
  navy: "#0A2342", page: "#F4F6F8", card: "#FFFFFF", line: "rgba(10,35,66,.08)",
  ink: "#16202E", mute: "#7C8A99",
  accBg: "#E6F1FB", accFg: "#185FA5", okBg: "#E1F5EE", okFg: "#0F6E56",
  warnBg: "#FAEEDA", warnFg: "#854F0B", dangBg: "#FAECE7", dangFg: "#993C1D",
  proBg: "#EEEDFE", proFg: "#3C3489", coral: "#D85A30",
};

export const Sect = ({ t }: { t: string }) => (
  <div style={{ fontSize: 13, fontWeight: 500, color: C.mute, margin: "16px 0 6px" }}>{t}</div>
);

// 潛點 slug → 圖片(沿用 m2 對照)
export const SPOT_IMG: Record<string, string> = {
  "bg-reeffish": "/home/src-04.webp", "bg-coraldiver": "/home/src-02.webp", "bg-blue": "/home/src-08.webp",
  "bg-macro": "/home/src-09.webp", "bg-coral": "/home/src-05.webp", "bg-boat": "/home/src-06.webp",
};
