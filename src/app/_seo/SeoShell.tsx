import Link from "next/link";
import { LINE_BOOK_URL, LineIcon } from "../_home/data";

// v496：SEO 行銷頁共用版型（海洋品牌風、輕量、含 LINE CTA 與內部互連）
// 用於 /course /northsea-diving /comment /haiwangzi —— 讓 Google 收錄、彼此互連提升爬取。

export const SEO_PAGES = [
  { href: "/schedule", label: "本月場次", icon: "🗓️" },
  { href: "/course", label: "潛水課程", icon: "🎓" },
  { href: "/pricing", label: "費用價目", icon: "💰" },
  { href: "/northsea-diving", label: "東北角潛點", icon: "🗺️" },
  { href: "/comment", label: "學員評價", icon: "💬" },
  { href: "/haiwangzi", label: "關於汪汪教練", icon: "⚜️" },
  { href: "/faq", label: "常見問題", icon: "❓" },
  { href: "/safety", label: "潛水安全", icon: "🛡️" },
];

export function SeoShell({
  eyebrow,
  title,
  subtitle,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  current: string;
  children: React.ReactNode;
}) {
  const others = SEO_PAGES.filter((p) => p.href !== current);
  return (
    <div style={{ minHeight: "100vh", background: "#eef3f6", color: "#1A2330", fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif" }}>
      {/* 頂部品牌列 */}
      <header style={{ background: "#0A2342", color: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 19 }}>🌊</span>
            <span style={{ fontWeight: 800, fontSize: 15 }}>東北角海王子潛水</span>
          </Link>
          <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 13, padding: "8px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <LineIcon s={15} />LINE 預約
          </a>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: "linear-gradient(160deg,#0A2342 0%,#0e3a6b 55%,#0a8f86 130%)", color: "#fff", padding: "40px 20px 46px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#7fd4cf", fontWeight: 700, marginBottom: 10 }}>{eyebrow}</div>
          <h1 style={{ fontSize: "clamp(26px,5vw,38px)", fontWeight: 900, margin: "0 0 12px", lineHeight: 1.25 }}>{title}</h1>
          {subtitle ? <p style={{ fontSize: 15.5, lineHeight: 1.85, color: "#d6e6ef", margin: 0, maxWidth: 680 }}>{subtitle}</p> : null}
        </div>
      </div>

      {/* 內容 */}
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "30px 20px 56px" }}>
        {children}

        {/* CTA */}
        <div style={{ textAlign: "center", background: "#fff", border: "1px solid #dfe7ee", borderRadius: 18, padding: "30px 22px", marginTop: 34, boxShadow: "0 4px 20px rgba(10,35,66,.06)" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#0A2342", marginBottom: 8 }}>準備好下水了嗎？</div>
          <p style={{ color: "#5a6b7d", fontSize: 14.5, margin: "0 0 18px" }}>加入官方 LINE，告訴汪汪你想潛的日期與人數，幫你把行程安排好。</p>
          <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 15.5, padding: "13px 26px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <LineIcon s={19} />加 LINE 預約潛水
          </a>
        </div>

        {/* 內部互連（SEO） */}
        <nav aria-label="更多介紹" style={{ marginTop: 30 }}>
          <div style={{ fontSize: 13, color: "#7c9296", textAlign: "center", marginBottom: 12 }}>更多介紹</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {others.map((p) => (
              <Link key={p.href} href={p.href} style={{ background: "#fff", border: "1px solid #d6e0e8", borderRadius: 999, padding: "9px 16px", color: "#0A2342", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>
                <span style={{ marginRight: 6 }}>{p.icon}</span>{p.label}
              </Link>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <Link href="/" style={{ color: "#0a8f86", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>← 回首頁</Link>
          </div>
        </nav>
      </main>
    </div>
  );
}

// 白色內容卡
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #dfe7ee", borderRadius: 16, padding: "clamp(20px,3.5vw,32px)", boxShadow: "0 4px 20px rgba(10,35,66,.05)", marginBottom: 18, ...style }}>
      {children}
    </div>
  );
}

// 難度色票
export function LevelPill({ level }: { level: string }) {
  const c = level === "初級" ? { bg: "#e3f6ec", fg: "#0a7d4f" } : level === "進階" ? { bg: "#e4eefb", fg: "#1d5fb8" } : { bg: "#fdeede", fg: "#b5631a" };
  return <span style={{ background: c.bg, color: c.fg, fontWeight: 800, fontSize: 12, padding: "3px 10px", borderRadius: 999 }}>{level}</span>;
}
