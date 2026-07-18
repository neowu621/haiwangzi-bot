// v386：/line — 手機前端入口頁。
//   給「在手機瀏覽器 / 非 LINE 環境」開到本站的客戶看的乾淨入口（取代被丟進 access.line.me 亂繞）。
//   CTA / 捷徑一律連 liff.line.me 深連結（從手機瀏覽器點會直接喚起 LINE App 開 LIFF）；
//   不連自家 /d /t，避免「桌機 /d→/line→/d」迴圈。
//   與 / (未來官網) 分流：/line = 手機前門，/ = 行銷主頁。
import Link from "next/link";

export const dynamic = "force-static";

const LIFF =
  process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
const ADD_FRIEND = "https://line.me/R/ti/p/@894bpmew";

const CARDS: Array<{ icon: string; title: string; desc: string; href: string; glow: string }> = [
  { icon: "🌊", title: "日潛預約", desc: "東北角全潛點", href: `${LIFF}/calendar`, glow: "#19c2a6" },
  { icon: "✈️", title: "旅遊潛水", desc: "蘭嶼／綠島／墾丁", href: `${LIFF}/tour`, glow: "#FF7B5A" },
  { icon: "📅", title: "場次行事曆", desc: "即時查空位", href: `${LIFF}/calendar`, glow: "#FFB800" },
  { icon: "📋", title: "我的預約", desc: "訂單／付款", href: `${LIFF}/my`, glow: "#19c2a6" },
];

export default function LineEntryPage() {
  return (
    <main
      className="min-h-dvh text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #14365e 0%, #0A2342 45%, #070f1c 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
        {/* 品牌 */}
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
            style={{ background: "radial-gradient(circle at 35% 30%, #1f4d75, #0A2342)", boxShadow: "0 0 0 1px rgba(255,255,255,.08), 0 6px 18px rgba(0,0,0,.4)" }}
          >
            🔱
          </div>
          <h1
            className="text-2xl font-black tracking-wide"
            style={{ background: "linear-gradient(90deg,#7fe9df,#19c2a6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          >
            東北角海王子潛水團
          </h1>
          <div className="mt-1 text-[10px] tracking-[3px] text-[#7fa6c4]">NORTHEAST CAPE · SEA PRINCE</div>
          <div className="mt-2 text-[12.5px] text-[#bcd2e6]">安全 · 專業 · 陪你看見海</div>
        </div>

        {/* 標語條 */}
        <div
          className="my-4 flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
          style={{ background: "linear-gradient(120deg, rgba(25,194,166,.14), rgba(10,35,66,.2))", border: "1px solid rgba(25,194,166,.25)" }}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "#19c2a6", boxShadow: "0 0 8px #19c2a6" }} />
          <div className="text-[12.5px] text-[#dff7f3]">跟著海王子，安全看見海 — 用手機 LINE 一鍵預約</div>
        </div>

        {/* v882：桌機專屬 QR 提示（只在 ≥1024px 顯示；手機看不到，維持原樣）。
            桌機下單已停用 → 引導用手機掃 QR 加 LINE 預約。 */}
        <div className="mb-4 hidden lg:flex items-center gap-4 rounded-2xl bg-white p-4" style={{ boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr-line-oa.png" alt="海王子 LINE QR Code" width={104} height={104} className="flex-none rounded-lg" style={{ width: 104, height: 104 }} />
          <div className="text-left">
            <div className="text-[15px] font-extrabold" style={{ color: "#0A2342" }}>用電腦看到這頁嗎？</div>
            <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "#5a6b7d" }}>
              預約下單請用<b style={{ color: "#0A2342" }}>手機</b>。用手機相機或 LINE 掃描左方 QR Code，加入海王子 LINE 即可預約潛水、查詢訂單。
            </div>
          </div>
        </div>

        {/* 主 CTA */}
        <a
          href={ADD_FRIEND}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-extrabold"
          style={{ background: "#06C755", color: "#063b1a" }}
        >
          ➕ 加入 LINE 好友
        </a>
        <a
          href={`${LIFF}/calendar`}
          className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-extrabold text-white"
          style={{ background: "linear-gradient(120deg,#06b6a4,#0e9f93)" }}
        >
          📱 開啟 LINE 預約
        </a>
        <div className="mb-4 text-center text-[10.5px] text-[#7fa6c4]">
          或在 LINE 搜尋官方帳號　<b className="text-[#bcd2e6]">@894bpmew</b>
        </div>

        {/* 捷徑格 */}
        <div className="grid grid-cols-2 gap-2.5">
          {CARDS.map((c) => (
            <a
              key={c.title}
              href={c.href}
              className="relative overflow-hidden rounded-2xl p-3.5"
              style={{ background: "linear-gradient(135deg,#0F2238 0%,#16314e 70%)", border: "1px solid rgba(255,255,255,.06)" }}
            >
              <span className="absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-50 blur-xl" style={{ background: c.glow }} />
              <div className="text-[22px]">{c.icon}</div>
              <div className="mt-2 text-sm font-extrabold">{c.title}</div>
              <div className="mt-0.5 text-[10.5px] text-[#9fb3c8]">{c.desc}</div>
            </a>
          ))}
          <a
            href={`${LIFF}/media`}
            className="relative col-span-2 flex items-center gap-3 overflow-hidden rounded-2xl p-3.5"
            style={{ background: "linear-gradient(135deg,#0F2238 0%,#16314e 70%)", border: "1px solid rgba(255,255,255,.06)" }}
          >
            <div className="text-[22px]">📸</div>
            <div>
              <div className="text-sm font-extrabold">最新動態</div>
              <div className="mt-0.5 text-[10.5px] text-[#9fb3c8]">每日潛水實況 · 影像日誌</div>
            </div>
          </a>
        </div>

        {/* 桌機提示 + 官網 */}
        <div className="mt-5 text-center text-[11px] leading-relaxed text-[#7fa6c4]">
          📌 預約功能透過 LINE 提供，請用<b className="text-[#bcd2e6]">手機</b>開啟最順。
          <br />
          <Link href="/" className="underline">前往潛水團官網 →</Link>
        </div>

        <div className="mt-6 text-center text-[10px] tracking-[2px] text-[#5b7a93]">
          BREATHE THE OCEAN
        </div>
      </div>
    </main>
  );
}
