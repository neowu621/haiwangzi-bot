import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SPOTS } from "../../_home/data";
import { SeoShell, Card, LevelPill } from "../../_seo/SeoShell";

// v497：單一潛點獨立可索引頁（每個潛點各自一頁，精準關鍵字更會排名）
export function generateStaticParams() {
  return SPOTS.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false; // 只允許 SPOTS 內的 slug，其餘 404

function find(slug: string) {
  return SPOTS.find((s) => s.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = find(slug);
  if (!s) return {};
  return {
    title: `${s.zh}潛水介紹（${s.en}）‧ 東北角海王子潛水`,
    description: `${s.zh}（${s.en}）潛點介紹：${s.d}`,
    alternates: { canonical: `/dive/${s.slug}` },
  };
}

export default async function DiveSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = find(slug);
  if (!s) notFound();

  const others = SPOTS.filter((x) => x.slug !== s.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: `${s.zh}（${s.en}）`,
    description: s.d,
    url: `https://haiwangzi.xyz/dive/${s.slug}`,
    touristType: "潛水",
    isAccessibleForFree: false,
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow={`Dive Site · ${s.en}`}
        title={`${s.zh} 潛水`}
        subtitle={`東北角潛點「${s.zh}」介紹——地形、深度、生態與適合程度。汪汪教練依你的狀況安排潛點與節奏。`}
        current="/northsea-diving"
      >
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0A2342", margin: 0 }}>{s.zh}</h2>
            <span style={{ fontSize: 13, color: "#9aabae" }}>{s.en}</span>
            <LevelPill level={s.level} />
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.95, color: "#33464e", margin: "0 0 16px" }}>{s.d}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {s.tags.map((t) => (
              <span key={t} style={{ background: "#eef3f6", color: "#456", fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 6 }}>{t}</span>
            ))}
          </div>
        </Card>

        {/* 其他潛點互連 */}
        <Card>
          <div style={{ fontWeight: 800, color: "#0A2342", marginBottom: 12 }}>其他東北角潛點</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
            {others.map((o) => (
              <Link key={o.slug} href={`/dive/${o.slug}`} style={{ border: "1px solid #d6e0e8", borderRadius: 999, padding: "8px 15px", color: "#0A2342", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>
                {o.zh}
              </Link>
            ))}
            <Link href="/northsea-diving" style={{ border: "1px solid #0a8f86", color: "#0a8f86", borderRadius: 999, padding: "8px 15px", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>
              全部潛點 →
            </Link>
          </div>
        </Card>
      </SeoShell>
    </>
  );
}
