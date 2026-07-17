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
  // JSON-LD：純文字答案直接收；JSX 答案改收 plain 欄位（v863）—— 兩者皆無才略過。
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((cat) =>
      cat.items
        .map((qa) => ({ q: qa.q, text: typeof qa.a === "string" ? qa.a : qa.plain }))
        .filter((x): x is { q: string; text: string } => typeof x.text === "string" && x.text.length > 0)
        .map((x) => ({
          "@type": "Question",
          name: x.q,
          acceptedAnswer: { "@type": "Answer", text: x.text },
        })),
    ),
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalShell title="常見問題 FAQ" updated="2026-06-12" backHref="/" backLabel="返回首頁" wide>
        {/* v877：改手風琴 —— 每題點擊才展開，答案預設收起，避免整頁變文字牆。
            原生 <details> 免 client JS（server component 直接用）。 */}
        <style>{`
          .faq-acc{border-bottom:1px solid #eef2f5;}
          .faq-acc > summary{list-style:none; cursor:pointer; display:flex; align-items:flex-start; gap:10px; padding:14px 2px; font-size:15.5px; font-weight:700; color:#1A2330;}
          .faq-acc > summary::-webkit-details-marker{display:none;}
          .faq-acc > summary:hover{color:#0A2342;}
          .faq-acc .faq-q{flex:1;}
          .faq-acc .faq-chev{flex:none; color:#9aabae; font-size:13px; margin-top:3px; transition:transform .2s;}
          .faq-acc[open] .faq-chev{transform:rotate(180deg); color:#0a8f86;}
          .faq-acc .faq-a{font-size:14.5px; line-height:1.8; color:#33464e; padding:0 2px 16px 2px;}
          /* 明確收合：全站有全域 reset 會蓋掉 <details> 原生收合，這裡強制未展開時隱藏答案 */
          .faq-acc:not([open]) .faq-a{display:none;}
        `}</style>
        <p style={{ margin: "0 0 6px", color: "#5a6b7d" }}>
          新手最常問的問題與安全須知都整理在這裡。<b>點各個問題即可展開答案。</b>有任何疑問也歡迎直接 LINE 問汪汪教練。
        </p>
        {FAQ.map((cat) => (
          <section key={cat.zh} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0A2342", margin: "22px 0 2px" }}>{cat.zh}</h2>
            <div style={{ fontSize: 11.5, letterSpacing: 1, color: "#9aabae", marginBottom: 6 }}>{cat.en}</div>
            {cat.items.map((qa) => (
              <details key={cat.zh + qa.q} className="faq-acc">
                <summary>
                  <span className="faq-q">{qa.q}</span>
                  <span className="faq-chev" aria-hidden>▾</span>
                </summary>
                <div className="faq-a">
                  {typeof qa.a === "string" ? <p style={{ margin: 0 }}>{qa.a}</p> : qa.a}
                </div>
              </details>
            ))}
          </section>
        ))}
      </LegalShell>
    </>
  );
}
