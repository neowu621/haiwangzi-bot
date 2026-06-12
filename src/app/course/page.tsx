import type { Metadata } from "next";
import { COURSES, LINE_BOOK_URL } from "../_home/data";
import { SeoShell, Card } from "../_seo/SeoShell";

export const metadata: Metadata = {
  title: "潛水課程 ‧ 體驗潛水/OW/AOW/Fun Dive ‧ 東北角海王子潛水",
  description: "東北角海王子潛水課程：免證照體驗潛水 NT$2,500、開放水域 OW 保證班 NT$14,500、進階 AOW NT$14,500、持證精進 Fun Dive 一對一練功。汪汪教練親自帶班，時間彈性。",
  alternates: { canonical: "/course" },
};

// v496：潛水課程獨立可索引頁（複用首頁 COURSES）+ Course 結構化資料
export default function CoursePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: COURSES.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Course",
        name: c.title,
        description: c.items.map((it) => it.t).join("；"),
        provider: { "@type": "Organization", name: "東北角海王子潛水", url: "https://haiwangzi.xyz" },
        ...(c.price.startsWith("NT$")
          ? { offers: { "@type": "Offer", price: c.price.replace(/[^0-9]/g, ""), priceCurrency: "TWD", category: "潛水課程" } }
          : {}),
      },
    })),
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow="Diving Courses"
        title="潛水課程"
        subtitle="從完全沒碰過水的免證照體驗，到 OW / AOW 考證、持證後的 Fun Dive 練功——汪汪教練依你的狀況把節奏調到最舒服，課程時間可彈性安排。"
        current="/course"
      >
        {COURSES.map((c) => {
          const isAsk = !c.price.startsWith("NT$");
          return (
            <Card key={c.title}>
              <span style={{ display: "inline-block", background: "#0A2342", color: "#7fd4cf", fontWeight: 800, fontSize: 11.5, letterSpacing: 1, padding: "4px 11px", borderRadius: 999, marginBottom: 12 }}>{c.badge}</span>
              <h2 style={{ fontSize: 21, fontWeight: 900, color: "#0A2342", margin: "0 0 10px" }}>{c.title}</h2>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #eef2f5" }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: isAsk ? "#0a8f86" : "#0A2342" }}>{c.price}</span>
                <span style={{ fontSize: 13, color: "#7c9296" }}>{c.includes}</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
                {c.items.map((it, i) => (
                  <li key={i} style={{ display: "flex", gap: 9, fontSize: 14.5, lineHeight: 1.7, color: it.hl ? "#0A2342" : "#33464e", fontWeight: it.hl ? 700 : 400 }}>
                    <span style={{ color: "#0a8f86", flexShrink: 0 }}>◆</span>
                    <span>{it.t}</span>
                  </li>
                ))}
              </ul>
              <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 7, background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "10px 20px", borderRadius: 999 }}>
                LINE 報名・諮詢「{c.title}」
              </a>
            </Card>
          );
        })}
      </SeoShell>
    </>
  );
}
