import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { COURSES } from "../_home/data";
import { SeoShell, Card } from "../_seo/SeoShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 讀 SiteConfig 最新定價（後台可改）

export const metadata: Metadata = {
  title: "費用價目表 ‧ 日潛/體驗/課程/裝備租借 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水費用一覽：日潛 Fun Dive、免證照體驗潛水 NT$2,500、OW/AOW 課程 NT$14,500、裝備租借價格。實際價格依場次與人數，歡迎 LINE 詢問。",
  alternates: { canonical: "/pricing" },
};

// 日潛 Fun Dive 每支氣瓶（含空氣）依潛點（老闆提供）
const DIVE_FEES: { site: string; price: number }[] = [
  { site: "東北角各潛點", price: 600 },
  { site: "宜蘭 萊萊鶯歌石與石城", price: 750 },
];

// 裝備租借：後台未設定時的 fallback（與後台 SiteConfig 同步）
const GEAR_DEFAULT: { key: string; label: string; price: number }[] = [
  { key: "BCD", label: "BCD 浮力背心", price: 350 },
  { key: "regulator", label: "調節器", price: 350 },
  { key: "wetsuit", label: "防寒衣", price: 150 },
  { key: "fins", label: "蛙鞋", price: 100 },
  { key: "mask", label: "面鏡", price: 100 },
  { key: "computer", label: "潛水電腦錶", price: 100 },
  { key: "full_set", label: "整套優惠", price: 1000 },
];

const nt = (n: number) => `NT$ ${n.toLocaleString()}`;

export default async function PricingPage() {
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" }, select: { gearRentalPrices: true } })
    .catch(() => null);

  const gearOverride = (cfg?.gearRentalPrices as Record<string, number>) ?? {};
  const gear = GEAR_DEFAULT.map((g) => ({ ...g, price: gearOverride[g.key] ?? g.price }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PriceSpecification",
    name: "東北角海王子潛水費用",
    priceCurrency: "TWD",
  };

  const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#7c9296", fontWeight: 700, borderBottom: "2px solid #e3e9f0" };
  const td: React.CSSProperties = { padding: "11px 12px", fontSize: 14.5, color: "#33464e", borderBottom: "1px solid #eef2f5" };
  const tdP: React.CSSProperties = { ...td, fontWeight: 800, color: "#0A2342", whiteSpace: "nowrap" };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow="Pricing"
        title="費用價目表"
        subtitle="日潛、體驗潛水、課程與裝備租借費用一覽。日潛實際金額依場次、潛數與人數而定，以下為參考價——確切報價歡迎 LINE 直接詢問汪汪。"
        current="/course"
      >
        {/* 日潛 Fun Dive */}
        <Card>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0A2342", margin: "0 0 4px" }}>🔱 日潛 Fun Dive（持證）</h2>
          <p style={{ fontSize: 13.5, color: "#7c9296", margin: "0 0 14px" }}>費用以「每支氣瓶（含空氣）」計，依潛點不同；一天通常 3 支氣瓶。裝備租借另計（見下表）。</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>潛點</th><th style={th}>每支氣瓶（含空氣）</th></tr></thead>
            <tbody>
              {DIVE_FEES.map((d) => (
                <tr key={d.site}><td style={td}>{d.site}</td><td style={tdP}>{nt(d.price)}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12.5, color: "#9aabae", margin: "12px 0 0" }}>※ 夜潛、船潛、水中推進器等特殊行程費用另計，歡迎 LINE 詢問。</p>
        </Card>

        {/* 課程 */}
        <Card>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0A2342", margin: "0 0 14px" }}>🎓 潛水課程</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>課程</th><th style={th}>費用</th><th style={th}>內容</th></tr></thead>
            <tbody>
              {COURSES.map((c) => (
                <tr key={c.title}>
                  <td style={td}>{c.title}</td>
                  <td style={{ ...tdP, color: c.price.startsWith("NT$") ? "#0A2342" : "#0a8f86" }}>{c.price}</td>
                  <td style={{ ...td, fontSize: 13, color: "#7c9296" }}>{c.includes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12.5, color: "#9aabae", margin: "12px 0 0" }}>※ 一對一加強／持證精進 Fun Dive 依需求討論報價。課程時間可彈性安排，詳細內容請見 <a href="/course" style={{ color: "#0a8f86" }}>潛水課程頁</a>。</p>
        </Card>

        {/* 裝備租借 */}
        <Card>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0A2342", margin: "0 0 14px" }}>🎽 裝備租借（每件 / 每日）</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>裝備</th><th style={th}>租金</th></tr></thead>
            <tbody>
              {gear.map((g) => (
                <tr key={g.key}>
                  <td style={{ ...td, fontWeight: g.key === "full_set" ? 800 : 400, color: g.key === "full_set" ? "#0a8f86" : "#33464e" }}>{g.label}</td>
                  <td style={tdP}>{nt(g.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <p style={{ textAlign: "center", color: "#7c9296", fontSize: 13.5, lineHeight: 1.8, marginTop: 6 }}>
          以上為參考價，實際依場次、潛數、人數與裝備需求而定。<br />確定日期預約收 50% 訂金；潛旅另有訂金＋尾款方式。歡迎 LINE 詢問最準確的報價。
        </p>
      </SeoShell>
    </>
  );
}
