// v386：/line — 手機前端入口（hub）。v885：改 Apple 質感轉折頁。
//   /d（手機）落此頁 → 客戶選：潛水預約 / 費用價目 / 會員優惠 / 線上詢問 / 常見問題。
//   潛水預約走 liff 深連結（LINE 內開 LIFF、手機瀏覽器喚起 LINE App）；其餘為站內頁。
//   桌機另有 QR 橫幅（v882，僅 ≥1024px 顯示）。force-static，不放即時資料。
import Link from "next/link";

export const dynamic = "force-static";

const LIFF =
  process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
const ADD_FRIEND = "https://line.me/R/ti/p/@894bpmew";
const BOOKING = `${LIFF}/booking?tab=calendar`; // 潛水預約 → 日潛

// iOS 分組清單項目
const ITEMS: Array<{ icon: string; title: string; desc: string; href: string; external?: boolean }> = [
  { icon: "💰", title: "費用價目", desc: "日潛 · 課程 · 裝備租借", href: "/pricing" },
  { icon: "🎁", title: "會員優惠", desc: "抵用金 · VIP 潛級回饋", href: "/rewards" },
  { icon: "💬", title: "線上詢問", desc: "留下需求，教練聯繫你", href: "/contact" },
  { icon: "❓", title: "常見問題", desc: "新手須知 · 耳壓 · 安全", href: "/faq" },
];

export default function LineEntryPage() {
  return (
    <main
      className="min-h-dvh text-white antialiased"
      style={{
        background:
          "radial-gradient(140% 100% at 50% -18%, #123a5c 0%, #0a2440 42%, #050f1d 100%)",
        fontFamily:
          "-apple-system,'SF Pro Text','Segoe UI','PingFang TC','Noto Sans TC',sans-serif",
      }}
    >
      <div className="mx-auto w-full max-w-[26rem] px-6 pb-14 pt-11">

        {/* 品牌 */}
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-icons/hwz-deepblue-256.webp"
            alt="東北角海王子潛水"
            width={64}
            height={64}
            className="rounded-[18px]"
            style={{ width: 64, height: 64, boxShadow: "0 10px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08)" }}
          />
          <h1 className="mt-4 text-[22px] font-bold tracking-[-.01em]">東北角海王子潛水</h1>
          <div className="mt-1.5 text-[10.5px] font-medium tracking-[.28em] text-[#6f9dc4]">
            NORTHEAST&nbsp;CAPE · SEA&nbsp;PRINCE
          </div>
          <div className="mt-2.5 text-[13px] text-[#aec6dc]">安全 · 專業 · 陪你看見海</div>
        </div>

        {/* v882：桌機 QR（僅 ≥1024px） */}
        <div className="mt-6 hidden items-center gap-4 rounded-2xl bg-white p-4 lg:flex" style={{ boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr-line-oa.png" alt="海王子 LINE QR Code" width={104} height={104} className="flex-none rounded-lg" style={{ width: 104, height: 104 }} />
          <div className="text-left">
            <div className="text-[15px] font-extrabold" style={{ color: "#0A2342" }}>用電腦看到這頁嗎？</div>
            <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "#5a6b7d" }}>
              預約下單請用<b style={{ color: "#0A2342" }}>手機</b>。用手機相機或 LINE 掃描左方 QR Code，即可加入海王子 LINE 預約潛水。
            </div>
          </div>
        </div>

        {/* 主 CTA：潛水預約 */}
        <a
          href={BOOKING}
          className="group mt-8 flex items-center gap-4 rounded-[22px] px-5 py-[18px] transition active:scale-[.985]"
          style={{
            background: "linear-gradient(135deg, #12c2b0 0%, #0b8f86 100%)",
            boxShadow: "0 14px 34px rgba(11,143,134,.42), inset 0 1px 0 rgba(255,255,255,.22)",
          }}
        >
          <span
            className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-[24px]"
            style={{ background: "rgba(255,255,255,.16)" }}
          >
            🤿
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[18px] font-bold tracking-[-.01em]">潛水預約</span>
            <span className="mt-0.5 block text-[12.5px] text-white/75">立即預約東北角日潛</span>
          </span>
          <span className="flex-none text-[22px] text-white/70">›</span>
        </a>

        {/* iOS 分組清單：其餘四項 */}
        <div
          className="mt-4 overflow-hidden rounded-[22px]"
          style={{ background: "rgba(255,255,255,.055)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09)", backdropFilter: "blur(12px)" }}
        >
          {ITEMS.map((it, i) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3.5 px-4 py-[15px] transition active:bg-white/10"
              style={i < ITEMS.length - 1 ? { boxShadow: "inset 0 -1px 0 rgba(255,255,255,.08)" } : undefined}
            >
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-[19px]"
                style={{ background: "rgba(255,255,255,.09)" }}
              >
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-semibold tracking-[-.01em] text-white">{it.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-white/45">{it.desc}</span>
              </span>
              <span className="flex-none text-[19px] text-white/25">›</span>
            </Link>
          ))}
        </div>

        {/* 次要：加 LINE 好友 */}
        <a
          href={ADD_FRIEND}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] py-[15px] text-[15px] font-bold transition active:scale-[.985]"
          style={{ background: "#06C755", color: "#053218" }}
        >
          <LineGlyph /> 加入 LINE 好友
        </a>
        <div className="mt-3 text-center text-[11px] text-[#6f9dc4]">
          預約功能透過 LINE 提供，請用<b className="text-[#bcd2e6]">手機</b>開啟最順 · 官方帳號 <b className="text-[#bcd2e6]">@894bpmew</b>
        </div>

        {/* 頁尾 */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-[12px] text-[#8fb2cf] underline underline-offset-4">前往潛水團官網 →</Link>
          <div className="mt-5 text-[10px] tracking-[3px] text-[#4f6f88]">BREATHE THE OCEAN</div>
        </div>

      </div>
    </main>
  );
}

function LineGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#053218" aria-hidden>
      <path d="M12 2C6.48 2 2 5.69 2 10.23c0 4.07 3.56 7.48 8.37 8.12.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.26-.2.99.87.54s5.77-3.4 7.87-5.82C21.2 13.7 22 12.04 22 10.23 22 5.69 17.52 2 12 2z" />
    </svg>
  );
}
