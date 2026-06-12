import type { Metadata } from "next";
import { BUILTIN_REVIEWS, DEFAULT_REVIEWS_NOTE } from "../_home/data";
import { SeoShell, Card } from "../_seo/SeoShell";

export const metadata: Metadata = {
  title: "學員評價 ‧ 東北角海王子潛水 汪汪教練",
  description: "真實學員怎麼說汪汪教練：從怕水到克服恐懼、從菜雞到近百潛、全家大小安心同潛、水下美照側拍。東北角海王子潛水學員心得整理。",
  alternates: { canonical: "/comment" },
};

// v496：學員評價獨立可索引頁（複用 BUILTIN_REVIEWS）+ Review/AggregateRating 結構化資料
export default function CommentPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "東北角海王子潛水",
    url: "https://haiwangzi.xyz",
    image: "https://haiwangzi.xyz/home/src-hero.webp",
    description: "東北角萊萊鶯歌石潛水基地，汪汪教練帶你安心探索水下世界。",
    aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: BUILTIN_REVIEWS.length, bestRating: "5" },
    review: BUILTIN_REVIEWS.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.name },
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      name: r.title || undefined,
      reviewBody: r.text,
    })),
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow="Student Voices"
        title="學員怎麼說"
        subtitle="每位學員的起點都不一樣——怕水的、剛拿證照的、想挑戰更深的海的；但他們信任汪汪的理由，始終只有一個：安心。"
        current="/comment"
      >
        {BUILTIN_REVIEWS.map((r, i) => (
          <Card key={`${r.name}-${i}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#0e3a6b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17, flexShrink: 0 }}>
                {r.name.slice(0, 1)}
              </div>
              <div>
                <div style={{ fontWeight: 800, color: "#0A2342", fontSize: 15 }}>{r.name}</div>
                {r.activity ? <div style={{ fontSize: 12, color: "#9aabae" }}>{r.activity}</div> : null}
              </div>
              <div style={{ marginLeft: "auto", color: "#f5a623", fontSize: 15, letterSpacing: 1 }}>★★★★★</div>
            </div>
            {r.title ? <h2 style={{ fontSize: 17, fontWeight: 900, color: "#0A2342", margin: "4px 0 8px" }}>{r.title}</h2> : null}
            <p style={{ fontSize: 14.5, lineHeight: 1.9, color: "#33464e", margin: 0 }}>{r.text}</p>
          </Card>
        ))}
        <p style={{ textAlign: "center", color: "#5a6b7d", fontSize: 14.5, lineHeight: 1.8, marginTop: 8 }}>{DEFAULT_REVIEWS_NOTE}</p>
      </SeoShell>
    </>
  );
}
