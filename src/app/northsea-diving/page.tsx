import type { Metadata } from "next";
import Link from "next/link";
import { SPOTS, TRIPS } from "../_home/data";
import { SeoShell, Card, LevelPill } from "../_seo/SeoShell";

export const metadata: Metadata = {
  title: "東北角潛點介紹 ‧ 潮境/深澳/萊萊/船潛 ‧ 東北角海王子潛水",
  description: "東北角熱門潛點懶人包：潮境公園、深澳象鼻岩、水晶宮、萊萊鶯歌石、82.8K 微距天堂、基隆嶼船潛。地形、深度、生態與適合程度一次看，汪汪教練帶你安心探索。",
  alternates: { canonical: "/northsea-diving" },
};

// v496：東北角潛點介紹獨立可索引頁（複用首頁 SPOTS + TRIPS）+ ItemList 結構化資料
export default function NorthseaDivingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "東北角潛點介紹",
    itemListElement: SPOTS.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "TouristAttraction", name: `${s.zh}（${s.en}）`, description: s.d },
    })),
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow="Northeast Coast Dive Sites"
        title="東北角潛點介紹"
        subtitle="海王子常帶隊的東北角潛點，地形與生態各有特色。剛拿證照、想穩定技巧？推薦從潮境、深澳開始練功；想挑戰地形與大物，再往船潛、萊萊走。"
        current="/northsea-diving"
      >
        {SPOTS.map((s) => (
          <Card key={s.n}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#9aabae" }}>{s.n}</span>
              <h2 style={{ fontSize: 19, fontWeight: 900, color: "#0A2342", margin: 0 }}>{s.zh}</h2>
              <span style={{ fontSize: 12.5, color: "#9aabae" }}>{s.en}</span>
              <LevelPill level={s.level} />
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.85, color: "#33464e", margin: "0 0 12px" }}>{s.d}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
              {s.tags.map((t) => (
                <span key={t} style={{ background: "#eef3f6", color: "#456", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6 }}>{t}</span>
              ))}
              <Link href={`/dive/${s.slug}`} style={{ marginLeft: "auto", color: "#0a8f86", fontWeight: 800, fontSize: 13.5, textDecoration: "none", whiteSpace: "nowrap" }}>看 {s.zh} 詳情 →</Link>
            </div>
          </Card>
        ))}

        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#0A2342", margin: "34px 0 6px" }}>潛旅目的地</h2>
        <p style={{ color: "#5a6b7d", fontSize: 14, margin: "0 0 18px" }}>除了東北角，汪汪也帶隊國內外潛旅——綠島、蘭嶼、小琉球，以及菲律賓媽媽島、薄荷島、科隆島。</p>
        {TRIPS.map((t) => (
          <Card key={t.zh}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "#0a8f86" }}>{t.n}</span>
              <h3 style={{ fontSize: 19, fontWeight: 900, color: "#0A2342", margin: 0 }}>{t.zh}</h3>
              <span style={{ fontSize: 12.5, color: "#9aabae" }}>{t.en}</span>
              <LevelPill level={t.level} />
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.85, color: "#33464e", margin: "0 0 12px" }}>{t.d}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {t.tags.map((tag) => (
                <span key={tag} style={{ background: "#eef3f6", color: "#456", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6 }}>{tag}</span>
              ))}
            </div>
          </Card>
        ))}
      </SeoShell>
    </>
  );
}
