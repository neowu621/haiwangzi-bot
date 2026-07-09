// v826：全站桌機共用頂部導覽（深色，視覺對齊首頁）。route 連結（非首頁 hash/scroll-spy）。
import { MantaTridentMark } from "@/components/brand/MantaTrident";
import s from "./SiteChrome.module.css";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "首頁" },
  { href: "/course", label: "潛水課程" },
  { href: "/pricing", label: "費用價目" },
  { href: "/northsea-diving", label: "東北角潛點" },
  { href: "/schedule", label: "本月場次" },
  { href: "/rewards", label: "會員優惠" },
  { href: "/faq", label: "常見問題" },
];

export function SiteHeader({ current }: { current?: string }) {
  return (
    <nav className={s.hdr} aria-label="主導覽">
      <a href="/" className={s.brand}>
        <MantaTridentMark size={36} variant="white" title="東北角海王子" />
        <span><b>東北角海王子</b><em>Northeast Coast Ocean Prince</em></span>
      </a>
      <div className={s.links}>
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className={current === n.href ? s.cur : undefined}>{n.label}</a>
        ))}
      </div>
      <a href="/pclogin" className={s.member}>會員登入</a>
    </nav>
  );
}
