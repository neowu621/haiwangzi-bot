import type { Metadata } from "next";
import { SeoShell, Card } from "../_seo/SeoShell";

export const metadata: Metadata = {
  title: "關於汪汪教練 ‧ 鬼蝠魟三叉戟的故事 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水教練「汪汪」的故事，與品牌標誌「鬼蝠魟三叉戟」的精神：安全、專業、陪伴。10 年教學年資、上萬次潛水經驗——敬畏海洋，而非征服海洋。",
  alternates: { canonical: "/haiwangzi" },
};

const TRIDENT = [
  { en: "Safety", zh: "安全", body: "永遠放在第一位。再漂亮的魚群、再難得的海洋生物，都比不上平安回到岸上重要。" },
  { en: "Professional", zh: "專業", body: "每一次下潛前的規劃、每一次裝備檢查、每一次海況判讀，都來自無數次經驗累積。" },
  { en: "Companion", zh: "陪伴", body: "教練不只是帶你下海的人。而是在你緊張時給你一個 OK 手勢、在你慌張時站在你身旁、在你成長時默默放手的人。" },
];

// v496：關於汪汪教練 + 品牌精神（鬼蝠魟三叉戟）獨立可索引頁 + Person 結構化資料
export default function HaiwangziPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "汪汪教練",
    jobTitle: "潛水教練",
    worksFor: { "@type": "Organization", name: "東北角海王子潛水 Sea Prince Diving", url: "https://haiwangzi.xyz" },
    description: "東北角海王子潛水教練，10 年教學年資、上萬次潛水經驗，信念是敬畏海洋而非征服海洋。",
    knowsAbout: ["潛水教學", "開放水域潛水", "進階潛水", "東北角潛點", "潛水安全"],
  };

  const lead: React.CSSProperties = { fontSize: 15.5, lineHeight: 2, color: "#33464e", margin: "0 0 16px" };
  const quote: React.CSSProperties = { borderLeft: "4px solid #0a8f86", background: "#f2f8f8", padding: "14px 18px", borderRadius: "0 10px 10px 0", color: "#0A2342", fontWeight: 700, fontSize: 16, lineHeight: 1.85, margin: "20px 0" };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeoShell
        eyebrow="About the Diver · Sea Prince Diving"
        title="鬼蝠魟三叉戟 —— 汪汪教練的故事"
        subtitle="像鬼蝠魟一樣優雅探索海洋，像三叉戟一樣堅守安全與專業。這就是汪汪教練想帶給每位潛水員的信念。"
        current="/haiwangzi"
      >
        {/* 教練簡介 + 數據 */}
        <Card>
          <h2 style={{ fontSize: 21, fontWeight: 900, color: "#0A2342", margin: "0 0 12px" }}>嗨，我是汪汪</h2>
          <p style={lead}>潛水這件事，最重要的從來不是裝備有多好，而是帶你下水的人夠不夠專業、夠不夠細心。從第一次教學到現在，我最在意的就是兩個字——「安心」。</p>
          <p style={lead}>無論你是完全沒碰過水的新手，還是想精進的進階潛水員，我都會依照你的狀況，把節奏調到最舒服，讓你把注意力放在欣賞海裡的世界。</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 18 }}>
            {[["10+", "教學年資"], ["10,000+", "潛水次數"], ["1,000+", "累積潛水人數"]].map(([n, l]) => (
              <div key={l} style={{ flex: "1 1 120px", textAlign: "center", background: "#0A2342", color: "#fff", borderRadius: 12, padding: "16px 12px" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#7fd4cf" }}>{n}</div>
                <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 故事 */}
        <Card>
          <p style={lead}>在東北角的海裡，流很急、浪很大，海況從來不會因為你是新手而變得溫柔。許多人第一次下海時，都希望身邊有位無所不能的英雄，能替自己擋掉所有風浪。但汪汪教練相信：</p>
          <blockquote style={quote}>真正的潛水教練，不是替你對抗大海，而是教會你敬畏大海。</blockquote>

          <p style={lead}>有一年，在綠島外海的潛點。當所有人都急著尋找海龜、找尋大魚時，一隻巨大的鬼蝠魟（Manta Ray）從藍色深海中緩緩出現。牠沒有衝刺，沒有炫耀力量，只是張開雙翼，順著海流優雅滑行。那一刻，所有潛水員都停止了踢動蛙鞋。因為大家忽然明白：</p>
          <blockquote style={quote}>海洋裡最強大的生物，往往不是最快、最兇猛的，而是最懂得與海共存的。</blockquote>

          <p style={lead}>汪汪教練後來常說：「潛水技術可以靠練習學會，但判斷力，需要時間累積。」就像鬼蝠魟一樣——牠不與海浪對抗，卻懂得利用海流；牠不追求速度，卻能航行最遠的距離；牠看似溫柔，卻擁有面對整片海洋的力量。</p>
        </Card>

        {/* 三叉戟三信念 */}
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#0A2342", margin: "32px 0 6px", textAlign: "center" }}>三叉戟的三項信念</h2>
        <p style={{ color: "#5a6b7d", fontSize: 14.5, textAlign: "center", margin: "0 0 20px", lineHeight: 1.8 }}>
          Logo 中的三叉戟，不是征服海洋的武器，而是海神賦予潛水人的責任。每一個叉尖都代表一項信念。
        </p>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          {TRIDENT.map((t) => (
            <Card key={t.en} style={{ marginBottom: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#0a8f86", fontWeight: 800, textTransform: "uppercase" }}>{t.en}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: "#0A2342", margin: "4px 0 10px" }}>⚜️ {t.zh}</div>
              <p style={{ fontSize: 14, lineHeight: 1.85, color: "#33464e", margin: 0 }}>{t.body}</p>
            </Card>
          ))}
        </div>

        {/* 結語 */}
        <Card style={{ marginTop: 24, background: "linear-gradient(160deg,#0A2342,#0e3a6b)", color: "#fff", borderColor: "transparent", textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: "#7fd4cf", fontWeight: 700, marginBottom: 8 }}>東北角海王子潛水 · Sea Prince Diving</div>
          <p style={{ fontSize: 16, lineHeight: 1.9, margin: "0 0 18px", fontWeight: 600 }}>
            鬼蝠魟代表海洋，三叉戟代表責任。兩者結合，成為了「鬼蝠魟三叉戟」——不只是 Logo，而是一種屬於東北角海王子潛水的精神象徵。
          </p>
          <div style={{ display: "grid", gap: 8, fontSize: 15.5, fontWeight: 700, color: "#d6e6ef" }}>
            <div>🌊 敬畏海洋，而非征服海洋。</div>
            <div>🤿 享受潛水，而非挑戰極限。</div>
            <div>💙 讓每一次下潛，都成為值得珍藏的回憶。</div>
          </div>
        </Card>
      </SeoShell>
    </>
  );
}
