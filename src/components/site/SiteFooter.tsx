// v826：全站桌機共用頁尾（深色，視覺對齊首頁）。
import type { ReactNode } from "react";
import s from "./SiteChrome.module.css";

const FOOT: [string, string][] = [
  ["/schedule", "本月場次"], ["/course", "潛水課程"], ["/pricing", "費用價目"], ["/rewards", "會員優惠"],
  ["/northsea-diving", "東北角潛點"], ["/comment", "學員評價"], ["/haiwangzi", "關於汪汪教練"],
  ["/faq", "常見問題"], ["/safety", "潛水安全"],
];

export function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className={s.ftr}>
      <div className={s.fwrap}>
        <div className={s.tag}>
          <div className={s.tagZh}>守護海洋 · 敬畏自然 · 探索深藍</div>
          <div className={s.tagEn}>Protect · Respect · Explore</div>
        </div>
        <div className={s.pills}>
          {FOOT.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </div>
        <div className={s.bottom}>
          {note ?? "東北角海王子潛水 · 安全．專業，陪你看見海"}<br />
          <a href="/">← 回官網首頁</a>
        </div>
      </div>
    </footer>
  );
}
