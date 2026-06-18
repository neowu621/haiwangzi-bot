// v582：個人海域活動險提醒卡(共用元件,自帶 inline 樣式,可用在 LIFF / 公開頁皆可)。
//   variant="compact":單張提醒卡(訂單成功頁用)。
//   variant="full":兩層保險說明(店家責任險 + 個人海域險,安全頁用)。
import { FUBON_MARINE_URL, INSURANCE_CTA_LABEL, INSURANCE_DISCLAIMER } from "@/lib/insurance";

const TEAL = "#0a8f86";
const TEAL_DARK = "#0a4f49";
const TINT = "#eef6f7";
const BORDER = "#cfe6e4";

function CtaButton() {
  return (
    <a
      href={FUBON_MARINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textAlign: "center",
        marginTop: 10,
        padding: "10px 14px",
        background: TEAL,
        color: "#fff",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {INSURANCE_CTA_LABEL} ↗
    </a>
  );
}

export function InsuranceNotice({ variant = "compact" }: { variant?: "compact" | "full" }) {
  if (variant === "full") {
    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0A2342", margin: "0 0 4px" }}>保險說明</div>
        <div style={{ fontSize: 13, color: "#5a6b7d", margin: "0 0 12px" }}>潛水有兩層保障,互補不可取代:</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, alignItems: "start" }}>
          <div style={{ background: "#fff", border: "1px solid #e3e9f0", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2330" }}>① 店家責任險</div>
            <div style={{ fontSize: 12.5, color: "#5a6b7d", lineHeight: 1.7, marginTop: 6 }}>
              教練/店家已投保「水域遊憩活動責任保險」,保障活動期間責任。
            </div>
          </div>
          <div style={{ background: TINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEAL_DARK }}>② 個人海域險</div>
            <div style={{ fontSize: 12.5, color: TEAL_DARK, lineHeight: 1.7, marginTop: 6 }}>
              保障您個人安全,<b>建議自行加保</b>。
            </div>
            <CtaButton />
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#8595a6", marginTop: 10, lineHeight: 1.6 }}>
          詳細投保內容與需求依保險條款,建議自行向富邦洽詢。
        </div>
      </div>
    );
  }

  // compact
  return (
    <div style={{ background: TINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEAL_DARK }}>🛟 為自己多一份安心</div>
      <div style={{ fontSize: 12.5, color: TEAL_DARK, lineHeight: 1.7, marginTop: 6 }}>
        教練已投保責任險;建議您自行加保<b>個人海域活動險</b>。
      </div>
      <CtaButton />
      <div style={{ fontSize: 11.5, color: "#6b7280", textAlign: "center", marginTop: 7 }}>{INSURANCE_DISCLAIMER}</div>
    </div>
  );
}
