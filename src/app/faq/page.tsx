import type { Metadata } from "next";
import { FAQ } from "../_home/data";
import { LegalShell } from "../_legal/LegalShell";

export const metadata: Metadata = {
  title: "常見問題 FAQ ‧ 東北角海王子潛水",
  description: "東北角海王子潛水常見問題：新手會怕嗎、耳朵會痛嗎、不會游泳可以潛水嗎、健康與安全、裝備準備、預約天氣費用、保險提醒。",
  alternates: { canonical: "/faq" },
};

// v495：FAQ 獨立頁（複製首頁 FAQ，server 渲染、可被 Google 索引）+ FAQPage 結構化資料
export default function FaqPage() {
  // JSON-LD：只收純文字答案（JSX 答案略過），讓 Google 可呈現 FAQ 摘要
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((cat) =>
      cat.items
        .filter((qa) => typeof qa.a === "string")
        .map((qa) => ({
          "@type": "Question",
          name: qa.q,
          acceptedAnswer: { "@type": "Answer", text: qa.a as string },
        })),
    ),
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalShell title="常見問題 FAQ" updated="2026-06-12" backHref="/" backLabel="返回首頁" wide>
        <p style={{ margin: "0 0 22px", color: "#5a6b7d" }}>
          新手最常問的問題與安全須知都整理在這裡。有任何疑問也歡迎直接 LINE 問汪汪教練。
        </p>
        {FAQ.map((cat) => (
          <section key={cat.zh} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0A2342", margin: "0 0 4px" }}>{cat.zh}</h2>
            <div style={{ fontSize: 11.5, letterSpacing: 1, color: "#9aabae", marginBottom: 12 }}>{cat.en}</div>
            {cat.items.map((qa) => (
              <div key={cat.zh + qa.q} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #eef2f5" }}>
                <h3 style={{ fontSize: 15.5, fontWeight: 700, color: "#1A2330", margin: "0 0 6px" }}>{qa.q}</h3>
                <div style={{ fontSize: 14.5, lineHeight: 1.8, color: "#33464e" }}>
                  {typeof qa.a === "string" ? <p style={{ margin: 0 }}>{qa.a}</p> : qa.a}
                </div>
              </div>
            ))}
          </section>
        ))}
      </LegalShell>
    </>
  );
}
