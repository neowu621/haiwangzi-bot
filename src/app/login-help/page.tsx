// v805：登入引導頁。v881：全站改「只維護手機」→ 移除電腦版登入相關訊息，
//   統一引導手機 LINE 登入預約。/api/auth/line/login 失敗時仍導來這裡當友善頁。
import Link from "next/link";

export const metadata = { title: "登入說明 — 東北角海王子潛水" };

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const LINE_GREEN = "#06C755";
const LIFF_URL = "https://liff.line.me/2010219428-E5frY7tm";
const OA_URL = "https://line.me/R/ti/p/%40894bpmew";

export default function LoginHelpPage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px", background: `linear-gradient(180deg, ${NAVY}, #041426)`, fontFamily: "-apple-system,'Segoe UI','Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif" }}>
      <div style={{ width: "min(92vw, 460px)", background: "#fff", borderRadius: 20, padding: "28px 24px", boxShadow: "0 24px 64px rgba(0,0,0,.35)" }}>
        <div style={{ fontSize: 40, textAlign: "center" }}>📱</div>
        <h1 style={{ margin: "10px 0 6px", fontSize: 20, fontWeight: 800, color: NAVY, textAlign: "center" }}>
          請用手機以 LINE 登入預約
        </h1>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.7, color: "#5c6b73", textAlign: "center" }}>
          為了更順暢的預約與付款體驗，會員登入與預約下單一律使用<b style={{ color: NAVY }}>手機 LINE</b>。<br />請用以下方式開始：
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href={LIFF_URL} style={{ display: "block", background: LINE_GREEN, color: "#fff", borderRadius: 12, padding: "13px 16px", textDecoration: "none" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>📱 用手機 LINE 開啟會員中心（推薦）</div>
            <div style={{ fontSize: 12, opacity: .92, marginTop: 3 }}>手機點此連結，或用 LINE 掃描本頁網址——預約、訂單、付款都能用</div>
          </a>
          <a href={OA_URL} style={{ display: "block", background: "#f0f7f5", border: `1px solid #cfe6e2`, color: NAVY, borderRadius: 12, padding: "13px 16px", textDecoration: "none" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>💬 加 LINE 官方帳號 @894bpmew</div>
            <div style={{ fontSize: 12, color: "#5c6b73", marginTop: 3 }}>由小編／汪汪教練直接協助您預約與查詢</div>
          </a>
        </div>

        <div style={{ marginTop: 18, textAlign: "center" }}>
          <Link href="/" style={{ fontSize: 12.5, color: TEAL, fontWeight: 700, textDecoration: "none" }}>← 回官網首頁</Link>
        </div>
      </div>
    </main>
  );
}
