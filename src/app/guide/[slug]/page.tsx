import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LINE_BOOK_URL, LineIcon } from "../../_home/data";
import { SeoShell, Card } from "../../_seo/SeoShell";

// v511：課程報名「說明書 + SOP」頁。給下單客戶看「報名後下一步該怎麼做」。
//   對應後台客製開單的合約類別：OW / AOW / 1對1 / 體驗潛水。

type Guide = {
  slug: string; title: string; en: string; emoji: string; badge: string; price: string; priceNote: string;
  intro: string;
  forWho: string[];
  prereq?: string;
  structure: { t: string; d: string }[];
  steps: { t: string; d: string }[];
  bring: string[];
  notes: string[];
};

const GUIDES: Guide[] = [
  {
    slug: "ow", title: "OW 開放水域潛水員課程", en: "Open Water Diver", emoji: "🎓", badge: "考證 · 第一張證照",
    price: "NT$ 14,500", priceNote: "含教材・氣瓶・裝備・泳池費。報名繳訂金 NT$6,000，首日上課繳清尾款。結業一年內外島＋國外旅行各 1 次免費租裝備。",
    intro: "OW 是你的第一張國際潛水證照，拿到後可在全世界合法從事休閒潛水（最深 18 米）。課程含學科、平靜水域（泳池）與開放水域（海洋）實習，讓你學會自主規劃與安全執行每一次潛水。",
    forWho: ["想取得正式國際潛水證照、未來能自由出國潛水的人", "完全新手也可以（會基本游泳更佳，但非必要）", "健康狀況良好、能配合安全指示者"],
    prereq: "無需先備證照。報名時需填寫健康聲明；若有心臟病、高血壓、氣喘、懷孕、中耳炎或近期手術等狀況請主動告知，由教練評估。",
    structure: [
      { t: "學科 2 小時", d: "理論 + 影片 + 測驗。地點：三重。平日／假日晚上也能排。" },
      { t: "泳池 4 小時", d: "平靜水域練基本技巧（呼吸、面鏡排水、浮力）。地點：青年公園（萬華水源路）。" },
      { t: "海洋實習 2 天（6 支氣瓶）", d: "東北角開放水域完成指定潛水技巧。" },
      { t: "加贈 1 天 Fun Dive（3 支氣瓶）", d: "海洋實習共 9 支氣瓶，結業慶祝多潛幾支。" },
    ],
    steps: [
      { t: "確認報名・繳訂金 NT$6,000", d: "保留你的名額與裝備。" },
      { t: "填健康聲明 + 提供報名資料", d: "姓名、性別、身高、體重、鞋號（幫你準備合身防寒衣與裝備）。有特殊健康狀況先告知。" },
      { t: "與汪汪約定上課日期", d: "可連續 4 天或拆開上：學科 → 泳池 → 海洋實習，時間彈性。" },
      { t: "上學科 → 泳池練習", d: "先把理論與基本技巧練熟、放鬆。" },
      { t: "東北角海洋實習 2 天", d: "在真實海域完成所有技巧，教練全程陪同。" },
      { t: "結業送證 🎉", d: "取得國際證照，再加贈 Fun Dive 慶祝。之後可繼續 AOW 或跟團潛旅。" },
    ],
    bring: ["泳衣／泳褲、浴巾、盥洗用品", "防曬、個人藥品", "易暈船者可備暈船藥", "近視者：日拋隱形眼鏡（或事先告知度數，準備度數面鏡）"],
    notes: ["前一晚請勿飲酒、避免熬夜，保持體力", "當天感冒、鼻塞或耳朵不適，因無法做耳壓平衡，建議改期", "請準時集合並全程配合教練安全指示", "潛水後 18–24 小時內避免搭飛機"],
  },
  {
    slug: "aow", title: "AOW 進階開放水域潛水員課程", en: "Advanced Open Water", emoji: "🏅", badge: "進階 · 深潛與專長",
    price: "NT$ 14,500", priceNote: "含教材・氣瓶・裝備・證照費。報名繳訂金 NT$6,000，首日繳清。加購高氧（Nitrox）證照優惠價 NT$3,500。",
    intro: "進階課程，帶你深潛（可到 30 米）並完成多項專長訓練，讓你潛得更廣、更安全、更有自信，也是參加多數國外潛旅的門檻。",
    forWho: ["已有 OW、想精進並挑戰更深海域的潛水員", "想參加深潛、夜潛、船潛等進階行程的人", "想把浮力與技巧再升級的潛水員"],
    prereq: "需先持有 OW（開放水域潛水員）或同等級證照。報名時攜帶證照、填健康聲明。",
    structure: [
      { t: "學科 2 小時", d: "進階理論與規劃。" },
      { t: "海洋實習 2 天（6 支氣瓶）", d: "七大專長任選：船潛・水下導航・夜潛・深潛・放流・頂尖中性浮力・水推 DPV。" },
      { t: "加贈 1 天 Fun Dive（3 支氣瓶）", d: "海洋實習共 9 支氣瓶。" },
      { t: "另含", d: "浮力袋、打撈袋使用與魚類辨識。" },
    ],
    steps: [
      { t: "確認 OW 證照 + 報名繳訂金 NT$6,000", d: "保留名額。" },
      { t: "填健康聲明 + 提供體型資料", d: "性別、身高、體重、鞋號，準備合身裝備。" },
      { t: "與汪汪約定上課日期", d: "學科 + 海洋實習 2 天（已有基礎，無需泳池）。" },
      { t: "海洋實習完成 5 潛", d: "含深潛、夜潛、導航等專長項目。" },
      { t: "結業送證 🎉", d: "取得 AOW 國際證照，可挑戰更深、更廣的潛點與國外潛旅。" },
    ],
    bring: ["OW 證照", "泳衣／泳褲、浴巾、盥洗用品", "防曬、個人藥品", "近視者：日拋隱形眼鏡或度數面鏡"],
    notes: ["前一晚勿飲酒、避免熬夜", "感冒、鼻塞、耳朵不適請改期", "夜潛場次請依教練指示攜帶／確認燈具", "潛水後 18–24 小時內避免搭飛機"],
  },
  {
    slug: "private", title: "1對1 潛水輔導課程", en: "Private Coaching", emoji: "🔱", badge: "持證精進 · 近一對一",
    price: "依需求討論報價", priceNote: "依你的目標、潛數與潛點客製，歡迎 LINE 詢問。建議平日時段（人少、近一對一）。",
    intro: "針對「剛拿證照、想把技巧練紮實」或「想被專注指導」的潛水員。平日小團、近一對一，汪汪把心力放在你身上，即時修正配重、中性浮力與踢法。",
    forWho: ["剛拿 OW／AOW、浮力或耗氣還抓不穩的人", "證照放久、想先複習找回手感的人", "想針對特定弱點或潛點被專注指導的人"],
    prereq: "需持有 OW 以上證照。證照放久沒潛也沒關係，會先安排複習潛。",
    structure: [
      { t: "完全客製", d: "依你的目標安排（例：練中性浮力、省氣、踢法、特定潛點）。" },
      { t: "下潛前技巧複習", d: "在淺水把基本功重新熟悉一遍，確認放鬆才往深走。" },
      { t: "平日近一對一", d: "平日人少，汪汪能更專注地帶你、不趕行程。" },
    ],
    steps: [
      { t: "LINE 告訴汪汪你的目標與程度", d: "例：想練浮力、複習、想去哪個潛點。" },
      { t: "討論並報價、約平日時段", d: "依潛數與潛點客製內容與費用。" },
      { t: "繳訂金確認（依報價）", d: "保留教練時段。" },
      { t: "提供體型／裝備資料", d: "需租裝備者提供性別、身高、體重、鞋號。" },
      { t: "當天：複習 → 針對弱點即時指導", d: "慢慢來、不趕進度，潛完幫你檢討。" },
    ],
    bring: ["個人證照", "個人裝備（若有）", "泳衣／泳褲、浴巾、盥洗用品", "防曬、個人藥品"],
    notes: ["前一晚勿飲酒、避免熬夜", "感冒、鼻塞、耳朵不適請改期", "任何時候不舒服比手勢，教練會帶你慢慢上升"],
  },
  {
    slug: "discover", title: "體驗潛水課程（免證照）", en: "Discover Scuba", emoji: "🐠", badge: "免證照 · 第一次也 OK",
    price: "NT$ 2,500", priceNote: "免證照・含基本照相 📷・全套裝備。確定日期預約收 50% 訂金。",
    intro: "免證照、第一次也能下海。完全沒潛過、不會游泳都可以——裝備提供浮力，教練一對一全程陪同，先在淺水慢慢適應再下潛，你只要放輕鬆呼吸。",
    forWho: ["想第一次體驗水肺潛水（scuba）的人", "不會游泳、怕水也想試試看的人", "想先玩一次再決定要不要考證的人"],
    prereq: "無需證照。健康狀況良好即可；若有心臟病、氣喘、懷孕、中耳炎等狀況請先告知教練評估。",
    structure: [
      { t: "基本課程 + 水下時間約 1.5 小時", d: "教練講解 → 淺水適應 → 陪同下潛。" },
      { t: "含基本照相 📷", d: "教練側拍，帶走水下回憶。" },
      { t: "全套裝備使用", d: "防寒衣、面鏡、呼吸器、浮力背心等都幫你準備。" },
    ],
    steps: [
      { t: "LINE 諮詢・選日期", d: "告訴汪汪你想潛的日期與人數。" },
      { t: "繳 50% 訂金確認名額", d: "確定日期後預約。" },
      { t: "提供報名資料", d: "性別、身高、體重、鞋號（準備合身防寒衣），並告知健康狀況。" },
      { t: "當天：講解 → 淺水適應 → 教練陪同下潛", d: "節奏由你決定，不勉強、不趕；約 1.5 小時。" },
      { t: "上岸看美照 🔱", d: "可順便詢問後續考 OW 證照的優惠。" },
    ],
    bring: ["泳衣／泳褲、浴巾、盥洗用品", "防曬", "個人藥品（如需要）"],
    notes: ["前一晚請勿飲酒、避免熬夜", "感冒、鼻塞或耳朵不適不建議下水，建議改期", "近視者可戴日拋隱形眼鏡", "任何時候不舒服比手勢，教練會立刻帶你慢慢上升"],
  },
];

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}
export const dynamicParams = false;

function find(slug: string) {
  return GUIDES.find((g) => g.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = find(slug);
  if (!g) return {};
  return {
    title: `${g.title}・報名與流程說明 ‧ 東北角海王子潛水`,
    description: `${g.title}（${g.en}）報名後該怎麼做：課程內容、費用、流程 SOP、要帶什麼、注意事項一次看懂。${g.intro.slice(0, 40)}`,
    alternates: { canonical: `/guide/${g.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = find(slug);
  if (!g) notFound();

  const others = GUIDES.filter((x) => x.slug !== g.slug);

  return (
    <SeoShell
      eyebrow={`Course Guide · ${g.en}`}
      title={`${g.emoji} ${g.title}`}
      subtitle="報名後該怎麼做？這頁把課程內容、流程、要準備的東西一次說清楚——照著做就對了，有問題隨時 LINE 問汪汪。"
      current="/course"
    >
      {/* 簡介 + 費用 */}
      <Card>
        <span style={pill}>{g.badge}</span>
        <p style={{ fontSize: 15, lineHeight: 1.9, color: "#33464e", margin: "10px 0 14px" }}>{g.intro}</p>
        <div style={{ background: "#f2f8f8", borderRadius: 12, padding: "13px 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: g.price.startsWith("NT$") ? "#0A2342" : "#0a8f86" }}>{g.price}</div>
          <div style={{ fontSize: 13, color: "#5a6b7d", marginTop: 4, lineHeight: 1.7 }}>{g.priceNote}</div>
        </div>
      </Card>

      {/* 適合對象 + 先決條件 */}
      <Card>
        <H>適合對象</H>
        <Ul items={g.forWho} />
        {g.prereq ? (
          <div style={{ marginTop: 14, background: "#fff7ed", border: "1px solid #fde4c4", borderRadius: 10, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.8, color: "#7a4a17" }}>
            <b>先決條件 / 健康提醒：</b>{g.prereq}
          </div>
        ) : null}
      </Card>

      {/* 課程內容 */}
      <Card>
        <H>課程內容</H>
        <div style={{ display: "grid", gap: 10 }}>
          {g.structure.map((s) => (
            <div key={s.t} style={{ borderLeft: "3px solid #0a8f86", paddingLeft: 12 }}>
              <div style={{ fontWeight: 800, color: "#0A2342", fontSize: 15 }}>{s.t}</div>
              <div style={{ fontSize: 13.5, color: "#5a6b7d", lineHeight: 1.7 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 報名後流程 SOP（重點）*/}
      <Card style={{ borderColor: "#bfe7e2" }}>
        <H>報名後的流程（照這個走）</H>
        <div style={{ display: "grid", gap: 0 }}>
          {g.steps.map((s, i) => (
            <div key={s.t} style={{ display: "flex", gap: 12, paddingBottom: i === g.steps.length - 1 ? 0 : 16 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: "#0a8f86", color: "#fff", fontWeight: 900, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                {i < g.steps.length - 1 ? <span style={{ flex: 1, width: 2, background: "#cfe7e3", marginTop: 2 }} /> : null}
              </div>
              <div style={{ paddingTop: 2 }}>
                <div style={{ fontWeight: 800, color: "#0A2342", fontSize: 15 }}>{s.t}</div>
                <div style={{ fontSize: 13.5, color: "#5a6b7d", lineHeight: 1.7 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 要帶什麼 */}
      <Card>
        <H>當天要帶什麼</H>
        <Ul items={g.bring} />
      </Card>

      {/* 注意事項 */}
      <Card>
        <H>注意事項（安全第一）</H>
        <Ul items={g.notes} warn />
      </Card>

      {/* 其他課程說明 */}
      <Card>
        <div style={{ fontWeight: 800, color: "#0A2342", marginBottom: 12 }}>其他課程說明</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {others.map((o) => (
            <Link key={o.slug} href={`/guide/${o.slug}`} style={{ border: "1px solid #d6e0e8", borderRadius: 999, padding: "8px 15px", color: "#0A2342", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>
              {o.emoji} {o.title.replace("課程", "").replace("（免證照）", "")}
            </Link>
          ))}
        </div>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 7, background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "11px 22px", borderRadius: 999 }}>
          <LineIcon s={18} />LINE 報名・諮詢
        </a>
      </Card>
    </SeoShell>
  );
}

const pill: React.CSSProperties = { display: "inline-block", background: "#0A2342", color: "#7fd4cf", fontWeight: 800, fontSize: 11.5, letterSpacing: 1, padding: "4px 11px", borderRadius: 999 };

function H({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 17, fontWeight: 900, color: "#0A2342", margin: "0 0 12px" }}>{children}</h2>;
}
function Ul({ items, warn }: { items: string[]; warn?: boolean }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: 9, fontSize: 14, lineHeight: 1.7, color: "#33464e" }}>
          <span style={{ color: warn ? "#d98324" : "#0a8f86", flexShrink: 0 }}>{warn ? "⚠️" : "◆"}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
