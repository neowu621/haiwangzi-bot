"use client";
// v429: 固定 header nav + 手機漢堡選單 + backdrop + 右側 dotnav（scroll-spy）client island。
//   從 page.tsx 抽出：scrolled / menuOpen / activeSec 狀態與 scroll/IntersectionObserver。
//   v408 的「目前裝置」badge（純裝飾）一併留在這裡。
import { useEffect, useState } from "react";
import { NAV, LINE_BOOK_URL, LineIcon } from "./data";

// v408：目前裝置示意 icon（依視窗寬度判斷 手機 / 平板 / 桌面）
type Device = "mobile" | "tablet" | "desktop";
const DEVICE_LABEL: Record<Device, string> = { mobile: "手機", tablet: "平板", desktop: "桌面" };
const DeviceIcon = ({ device }: { device: Device }) => {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (device === "mobile")
    return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
  if (device === "tablet")
    return <svg {...common}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
  return <svg {...common}><rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
};

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSec, setActiveSec] = useState("top");
  const [device, setDevice] = useState<Device>("desktop");

  // v408：目前裝置（依視窗寬度即時判斷）
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setDevice(w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // scrolled 狀態 + scroll-spy（active section）
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const spy = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setActiveSec((e.target as HTMLElement).id); }),
      { rootMargin: "-48% 0px -48% 0px" },
    );
    document.querySelectorAll(".hw section[id]").forEach((s) => spy.observe(s));
    return () => { window.removeEventListener("scroll", onScroll); spy.disconnect(); };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
        <a href="#top" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="crest"><img src="/home/src-11.png" alt="東北角海王子 logo" /></span>
          <span className="name"><b>東北角海王子</b><span>Northeast Coast Ocean Prince</span></span>
        </a>
        <nav className="nav-links">{NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}</nav>
        <span className="dev-badge" title={`目前裝置：${DEVICE_LABEL[device]}`} aria-label={`目前裝置：${DEVICE_LABEL[device]}`}>
          <DeviceIcon device={device} />
        </span>
        {/* v481：瀏覽器會員登入 / 線上下單入口（測試期間導向 /dtest） */}
        <a href="/dtest" className="nav-member" title="會員登入 / 線上預約">會員登入</a>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line nav-cta"><LineIcon />LINE 預約</a>
        <button className={`nav-toggle${menuOpen ? " open" : ""}`} aria-label="開啟選單" onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button>
      </header>
      <div className={`nav-backdrop${menuOpen ? " open" : ""}`} onClick={closeMenu} />
      <nav className={`nav-menu${menuOpen ? " open" : ""}`} aria-label="行動選單">
        {NAV.map((n) => <a key={n.href} href={n.href} onClick={closeMenu}>{n.label}</a>)}
        <a href="/dtest" onClick={closeMenu}>會員登入 / 線上預約</a>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line" onClick={closeMenu}><LineIcon />LINE 預約</a>
      </nav>

      {/* v460：圓點順序 = NAV（已對齊頁面 section 順序），尾端補 #book 預約區 */}
      <div className="dotnav">
        {[{ id: "top", l: "首頁" }, ...NAV.map((n) => ({ id: n.href.slice(1), l: n.label })), { id: "book", l: "立即預約" }].map((d) => (
          <a key={d.id} href={`#${d.id}`} className={activeSec === d.id ? "active" : ""}><span className="lbl">{d.l}</span><span className="dot" /></a>
        ))}
      </div>
    </>
  );
}
