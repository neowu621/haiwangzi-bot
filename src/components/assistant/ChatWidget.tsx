"use client";
// v758+：網站 AI 客服浮動小幫手。右下角按鈕 → 展開聊天視窗。
//   v771：改「導引式選單」三層漏斗——打開先給可點選單(零 token)，點不到再打字問 AI(/api/assistant)，
//         最後一層永遠有真人出口(LINE)。固定內容走 assistant-menu；即時資料(場次/潛旅/價目/政策)
//         直接打既有公開 API(皆有版本號快取，命中零 DB)，不經過 AI。
//   輕量、無外部依賴、inline 樣式；行動裝置/LINE WebView 友善。
import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ASSISTANT_MENU, LINE_URL, type MenuNode, type MenuLink, type AnswerCard, type LiveKind } from "@/lib/assistant-menu";

interface Msg { role: "user" | "assistant"; content: string; card?: AnswerCard; links?: MenuLink[] }

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const LINE_GREEN = "#06C755";
const GREET = "嗨！我是海王子潛水的 AI 小幫手 🐠 點下面就能找答案，也可以直接打字問我～";

// ── 即時查詢：時區/日期小工具（比照後端，用 Asia/Taipei）──
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const tzToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const tzPlus = (base: string, days: number) => {
  const d = new Date(`${base}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
};
const weekdayOf = (ds: string) => WD[new Date(`${ds}T12:00:00+08:00`).getDay()];

const GEAR_LABEL: Record<string, string> = { full_set: "全套裝備", BCD: "BCD浮力調整背心", regulator: "調節器", wetsuit: "防寒衣", fins: "蛙鞋", mask: "面鏡", computer: "潛水電腦錶" };

interface TripLite { date: string; startTime: string; isBoat?: boolean; tankCount?: number; available: number | null; sites?: { name?: string }[] }
interface TourLite { title: string; dateStart: string; dateEnd: string; basePrice: number; deposit: number; available: number | null; durationLabel?: string | null; beginnerFriendly?: boolean }

function fmtTrips(trips: TripLite[]): string {
  return trips
    .map((t) => {
      const seat = t.available == null ? "可預約" : t.available <= 0 ? "已滿" : `剩 ${t.available} 位`;
      const names = (t.sites ?? []).map((s) => s.name).filter(Boolean).join("、") || "東北角";
      return `・${t.date}（${weekdayOf(t.date)}）${t.startTime} ${names}｜${t.isBoat ? "船潛" : "岸潛"}｜${t.tankCount ?? "-"}潛｜${seat}`;
    })
    .join("\n");
}

/** 即時節點：直接打既有公開 API（版本號快取，命中零 DB），完全不經過 AI／不耗 token。 */
async function fetchLive(kind: LiveKind): Promise<{ content: string; links?: MenuLink[] }> {
  if (kind === "sessions-weekend" || kind === "sessions-2w") {
    const today = tzToday();
    let from = today, to: string;
    let head: string;
    if (kind === "sessions-weekend") {
      const dow = new Date(`${today}T12:00:00+08:00`).getDay();
      const sat = tzPlus(today, (6 - dow + 7) % 7);
      const sun = tzPlus(sat, 1);
      from = sat; to = sun;
      head = `本週末＝ ${sat}（六）、${sun}（日）的場次：`;
    } else {
      to = tzPlus(today, 14);
      head = `今天 ${today}（${weekdayOf(today)}）起近兩週的場次：`;
    }
    const r = await fetch(`/api/trips?from=${from}&to=${to}`, { headers: { accept: "application/json" } });
    const data = (await r.json()) as { trips?: TripLite[] };
    const trips = data.trips ?? [];
    const links: MenuLink[] = [{ label: "打開完整場次表", href: "/schedule" }, { label: "線上預約／會員", href: "/pclogin" }];
    if (trips.length === 0) return { content: `${head}\n這段期間目前沒有開放預約的場次 😅 可以加 LINE 問汪汪教練，或許願開團！`, links };
    return { content: `${head}\n${fmtTrips(trips)}\n（報名／確認名額請加 LINE @894bpmew）`, links };
  }
  if (kind === "tours") {
    const r = await fetch("/api/tours", { headers: { accept: "application/json" } });
    const data = (await r.json()) as { tours?: TourLite[] };
    const tours = data.tours ?? [];
    const links: MenuLink[] = [{ label: "看潛旅行程", href: "/#trips" }];
    if (tours.length === 0) return { content: "目前沒有開放報名的潛旅團 😅 想去哪裡可以加 LINE 許願開團！", links };
    const lines = tours
      .map((t) => {
        const seat = t.available == null ? "可報名" : t.available <= 0 ? "已額滿" : `剩 ${t.available} 位`;
        const dur = t.durationLabel ? `（${t.durationLabel}）` : "";
        return `・${t.title}${dur}：${t.dateStart}~${t.dateEnd}｜每人 NT$${t.basePrice.toLocaleString()}（訂金 ${t.deposit.toLocaleString()}）｜${seat}${t.beginnerFriendly ? "｜新手友善" : ""}`;
      })
      .join("\n");
    return { content: `目前開放報名的潛旅團：\n${lines}\n（報名／詳情請加 LINE @894bpmew）`, links };
  }
  if (kind === "gear") {
    const r = await fetch("/api/site-config", { headers: { accept: "application/json" } });
    const data = (await r.json()) as { gearRentalPrices?: Record<string, number>; defaultTripPricing?: { baseTrip?: number; extraTank?: number; nightDive?: number; scooterRental?: number } };
    const parts: string[] = [];
    const gear = data.gearRentalPrices ?? {};
    const g = Object.entries(gear)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([k, v]) => `・${GEAR_LABEL[k] ?? k}：NT$${v.toLocaleString()}`);
    if (g.length) parts.push(`【裝備租借】\n${g.join("\n")}`);
    const tp = data.defaultTripPricing ?? {};
    const bits: string[] = [];
    if (tp.baseTrip) bits.push(`・基本費 NT$${tp.baseTrip.toLocaleString()}`);
    if (tp.extraTank) bits.push(`・每支氣瓶 NT$${tp.extraTank.toLocaleString()}`);
    if (tp.nightDive) bits.push(`・夜潛加價 NT$${tp.nightDive.toLocaleString()}`);
    if (tp.scooterRental) bits.push(`・水中推進器 NT$${tp.scooterRental.toLocaleString()}`);
    if (bits.length) parts.push(`【日潛費用參考】\n${bits.join("\n")}`);
    const links: MenuLink[] = [{ label: "看場次表", href: "/schedule" }];
    if (!parts.length) return { content: "目前後台還沒設定公開價目 😅 加 LINE 跟汪汪教練確認最新報價最準～", links };
    return { content: `${parts.join("\n\n")}\n\n（實際以現場為準，特殊組合請加 LINE 確認）`, links };
  }
  // cancel / safety
  const r = await fetch("/api/config", { headers: { accept: "application/json" } });
  const data = (await r.json()) as { cancellationPolicy?: string; safetyPolicy?: string };
  if (kind === "cancel") {
    const text = (data.cancellationPolicy ?? "").trim();
    return { content: text || "取消／退款細節請加 LINE 跟汪汪教練確認 🙂" };
  }
  const text = (data.safetyPolicy ?? "").trim();
  return { content: text || "安全須知細節請加 LINE 跟汪汪教練確認 🙂" };
}

function BotMascot({ compact = false }: { compact?: boolean }) {
  const size = compact ? 42 : 62;
  const eye = compact ? 4 : 5;
  return (
    <span
      className={compact ? "hwz-bot hwz-bot-compact" : "hwz-bot"}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <span className="hwz-bot-shadow" />
      <span className="hwz-bot-antenna">
        <span />
      </span>
      <span className="hwz-bot-head">
        <span className="hwz-bot-glass">
          <span className="hwz-bot-eye" style={{ width: eye, height: eye }} />
          <span className="hwz-bot-eye" style={{ width: eye, height: eye }} />
        </span>
        <span className="hwz-bot-smile" />
      </span>
      <span className="hwz-bot-fin hwz-bot-fin-left" />
      <span className="hwz-bot-fin hwz-bot-fin-right" />
      <span className="hwz-bot-bubble hwz-bot-bubble-one" />
      <span className="hwz-bot-bubble hwz-bot-bubble-two" />
    </span>
  );
}

function BotStyles() {
  return (
    <style>{`
      .hwz-bot {
        position: relative;
        display: inline-block;
        flex: 0 0 auto;
        animation: hwz-bot-float 2.8s ease-in-out infinite;
        transform-origin: 50% 70%;
      }
      .hwz-bot-compact {
        animation-duration: 3.1s;
      }
      .hwz-bot-shadow {
        position: absolute;
        left: 17%;
        right: 17%;
        bottom: 1%;
        height: 10%;
        border-radius: 999px;
        background: rgba(4, 18, 34, .22);
        filter: blur(3px);
        animation: hwz-bot-shadow 2.8s ease-in-out infinite;
      }
      .hwz-bot-head {
        position: absolute;
        inset: 16% 9% 12%;
        border-radius: 38% 38% 44% 44%;
        background:
          radial-gradient(circle at 28% 18%, rgba(255,255,255,.95) 0 8%, transparent 9%),
          linear-gradient(150deg, #e9fbff 0%, #76dce5 44%, #0e9f93 100%);
        border: 2px solid rgba(255,255,255,.88);
        box-shadow:
          inset -8px -10px 18px rgba(5, 78, 93, .24),
          0 8px 18px rgba(1, 44, 64, .24);
      }
      .hwz-bot-glass {
        position: absolute;
        left: 17%;
        right: 17%;
        top: 25%;
        height: 29%;
        border-radius: 999px;
        background: linear-gradient(180deg, #12365f, #071f3a);
        border: 1px solid rgba(255,255,255,.55);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 17%;
        overflow: hidden;
      }
      .hwz-bot-glass::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent 0 18%, rgba(255,255,255,.26) 31%, transparent 45%);
        animation: hwz-bot-scan 3.6s ease-in-out infinite;
      }
      .hwz-bot-eye {
        position: relative;
        z-index: 1;
        border-radius: 999px;
        background: #83fff5;
        box-shadow: 0 0 10px rgba(131,255,245,.9);
        animation: hwz-bot-blink 4.2s infinite;
      }
      .hwz-bot-smile {
        position: absolute;
        left: 39%;
        right: 39%;
        top: 63%;
        height: 8%;
        border-bottom: 2px solid rgba(7,31,58,.55);
        border-radius: 0 0 999px 999px;
      }
      .hwz-bot-antenna {
        position: absolute;
        left: 50%;
        top: 0;
        width: 2px;
        height: 20%;
        transform: translateX(-50%);
        background: rgba(255,255,255,.75);
      }
      .hwz-bot-antenna span {
        position: absolute;
        left: 50%;
        top: -5px;
        width: 10px;
        height: 10px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: #ffbf3c;
        box-shadow: 0 0 0 5px rgba(255,191,60,.18), 0 0 14px rgba(255,191,60,.8);
        animation: hwz-bot-pulse 1.8s ease-in-out infinite;
      }
      .hwz-bot-fin {
        position: absolute;
        top: 49%;
        width: 18%;
        height: 23%;
        border-radius: 70% 28% 70% 28%;
        background: linear-gradient(180deg, #ffcf63, #ff7b5a);
        box-shadow: 0 5px 12px rgba(255,123,90,.24);
      }
      .hwz-bot-fin-left {
        left: 1%;
        transform: rotate(-25deg);
        animation: hwz-bot-fin-left 1.9s ease-in-out infinite;
      }
      .hwz-bot-fin-right {
        right: 1%;
        transform: scaleX(-1) rotate(-25deg);
        animation: hwz-bot-fin-right 1.9s ease-in-out infinite;
      }
      .hwz-bot-bubble {
        position: absolute;
        border: 1px solid rgba(255,255,255,.8);
        border-radius: 999px;
        background: rgba(142, 245, 255, .25);
        opacity: 0;
      }
      .hwz-bot-bubble-one {
        right: 0;
        top: 38%;
        width: 8px;
        height: 8px;
        animation: hwz-bot-bubble 2.4s ease-in infinite;
      }
      .hwz-bot-bubble-two {
        right: 9%;
        top: 28%;
        width: 5px;
        height: 5px;
        animation: hwz-bot-bubble 2.4s .7s ease-in infinite;
      }
      @keyframes hwz-bot-float {
        0%, 100% { transform: translateY(0) rotate(-1deg); }
        50% { transform: translateY(-7px) rotate(2deg); }
      }
      @keyframes hwz-bot-shadow {
        0%, 100% { transform: scaleX(.9); opacity: .52; }
        50% { transform: scaleX(1.14); opacity: .3; }
      }
      @keyframes hwz-bot-pulse {
        0%, 100% { transform: translateX(-50%) scale(.9); }
        50% { transform: translateX(-50%) scale(1.15); }
      }
      @keyframes hwz-bot-blink {
        0%, 45%, 52%, 100% { transform: scaleY(1); }
        48% { transform: scaleY(.18); }
      }
      @keyframes hwz-bot-scan {
        0%, 45% { transform: translateX(-120%); }
        70%, 100% { transform: translateX(120%); }
      }
      @keyframes hwz-bot-fin-left {
        0%, 100% { transform: rotate(-25deg); }
        50% { transform: rotate(-38deg) translateY(2px); }
      }
      @keyframes hwz-bot-fin-right {
        0%, 100% { transform: scaleX(-1) rotate(-25deg); }
        50% { transform: scaleX(-1) rotate(-38deg) translateY(2px); }
      }
      @keyframes hwz-bot-bubble {
        0% { transform: translate(0, 0) scale(.7); opacity: 0; }
        20% { opacity: .85; }
        100% { transform: translate(11px, -30px) scale(1.2); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .hwz-bot,
        .hwz-bot *,
        .hwz-bot::before,
        .hwz-bot::after {
          animation: none !important;
        }
      }
    `}</style>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: GREET }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true); // v764：後台可停用
  const [path, setPath] = useState<MenuNode[]>([]); // v771：選單下鑽路徑（空=主選單）
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // 只放在桌機首頁 `/`（手機走 proxy `/mobile`）；後台停用時也隱藏。
  const onHome = pathname === "/";
  const hidden = !onHome || !botEnabled;

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, loading]);

  // v764：抓後台設定（是否啟用 + 自訂招呼語）
  useEffect(() => {
    if (!onHome) return;
    let alive = true;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; greeting?: string }) => {
        if (!alive) return;
        if (d.enabled === false) setBotEnabled(false);
        if (d.greeting) setMsgs((m) => (m.length === 1 ? [{ role: "assistant", content: d.greeting as string }] : m));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [onHome]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = (await r.json()) as { reply?: string; error?: string };
      setMsgs((m) => [...m, { role: "assistant", content: data.reply || data.error || "暫時無法回覆，請加 LINE @894bpmew 詢問 🙂" }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "連線出了點問題，請稍後再試或加 LINE @894bpmew 🙂" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, msgs]);

  // v771：目前這一層要顯示的選單按鈕（空路徑=主選單）
  const currentChildren = (path.length ? path[path.length - 1].children : ASSISTANT_MENU) ?? [];

  // 點選單節點：分支→下鑽；即時→查 API；靜態葉→顯示答案卡
  const pickNode = useCallback(async (node: MenuNode) => {
    setMsgs((m) => [...m, { role: "user", content: node.label }]);
    if (node.children && node.children.length) {
      setPath((p) => [...p, node]);
      setMsgs((m) => [...m, { role: "assistant", content: node.intro || "想了解哪一個呢？" }]);
      return;
    }
    if (node.live) {
      setLoading(true);
      try {
        const { content, links } = await fetchLive(node.live);
        setMsgs((m) => [...m, { role: "assistant", content, links }]);
      } catch {
        setMsgs((m) => [...m, { role: "assistant", content: "查詢時出了點問題，請稍後再試或加 LINE @894bpmew 問汪汪教練 🙂" }]);
      } finally {
        setLoading(false);
      }
      return;
    }
    setMsgs((m) => [...m, { role: "assistant", content: node.answer ?? "", card: node.card, links: node.links }]);
  }, []);

  const goBack = useCallback(() => setPath((p) => p.slice(0, -1)), []);
  const goHome = useCallback(() => setPath([]), []);

  if (hidden) return null;

  return (
    <>
      <BotStyles />
      {/* 浮動按鈕 */}
      {!open && (
        <button
          type="button"
          aria-label="開啟 AI 客服"
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", right: 16, bottom: 16, zIndex: 9998,
            width: 74, height: 74, borderRadius: "50%", border: "1px solid rgba(255,255,255,.68)", cursor: "pointer",
            background: "radial-gradient(circle at 35% 25%, #7ff7ee 0%, #0e9f93 52%, #075f67 100%)",
            color: "#fff", boxShadow: "0 10px 28px rgba(0,64,86,.34)",
            display: "grid", placeItems: "center", padding: 0,
          }}
        >
          <BotMascot />
        </button>
      )}

      {/* 聊天面板 */}
      {open && (
        <div
          role="dialog"
          aria-label="AI 客服對話"
          style={{
            position: "fixed", right: 12, bottom: 12, zIndex: 9999,
            width: "min(370px, calc(100vw - 24px))", height: "min(560px, calc(100vh - 24px))",
            display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16,
            overflow: "hidden", boxShadow: "0 10px 36px rgba(0,0,0,.28)",
            fontFamily: "-apple-system,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
          }}
        >
          {/* header */}
          <div style={{ background: NAVY, color: "#fff", padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <BotMascot compact />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>海王子 AI 小幫手</div>
                <div style={{ fontSize: 11, opacity: .76 }}>潛水課程・潛點・預約諮詢</div>
              </div>
            </div>
            <button type="button" aria-label="關閉" onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          {/* 訊息區 */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, background: "#f4f7fa" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{
                  maxWidth: m.role === "user" ? "82%" : "92%", padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6, wordBreak: "break-word",
                  background: m.role === "user" ? TEAL : "#fff",
                  color: m.role === "user" ? "#fff" : NAVY,
                  border: m.role === "user" ? "none" : "1px solid #e3e9f0",
                }}>
                  {/* 結構化答案卡（課程/潛點等固定內容） */}
                  {m.card && (
                    <div style={{ marginBottom: m.content ? 8 : 0 }}>
                      {(m.card.title || m.card.price) && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, borderBottom: "1px solid #eef2f6", paddingBottom: 6, marginBottom: 6 }}>
                          {m.card.title && <span style={{ fontWeight: 800, fontSize: 14 }}>{m.card.title}</span>}
                          {m.card.price && <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: TEAL, whiteSpace: "nowrap" }}>{m.card.price}</span>}
                        </div>
                      )}
                      {m.card.bullets?.map((b, j) => (
                        <div key={j} style={{ fontSize: 12.5, lineHeight: 1.65, color: "#3a4b5c" }}>{b}</div>
                      ))}
                      {m.card.note && <div style={{ marginTop: 6, fontSize: 12, color: "#6b7b8c" }}>{m.card.note}</div>}
                    </div>
                  )}
                  {m.content && <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>}
                  {/* 可點連結（站內） */}
                  {m.links && m.links.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {m.links.map((l, j) => (
                        <a key={j} href={l.href} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eef7f5", color: "#075f67", border: "1px solid #cfe6e2", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>{l.label} ›</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                <div style={{ padding: "8px 11px", borderRadius: 12, fontSize: 13.5, background: "#fff", color: "#8595a6", border: "1px solid #e3e9f0" }}>輸入中…</div>
              </div>
            )}
          </div>

          {/* v771：導引式選單快捷區（永遠可點；即時節點直接查 API、不耗 token） */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid #eef2f6", background: "#fff", maxHeight: 208, overflowY: "auto" }}>
            {path.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                <button type="button" onClick={goBack}
                  style={{ background: "transparent", border: "none", color: "#5f7385", fontSize: 12, cursor: "pointer", padding: "2px 2px" }}>‹ 回上一層</button>
                <button type="button" onClick={goHome}
                  style={{ background: "transparent", border: "none", color: "#5f7385", fontSize: 12, cursor: "pointer", padding: "2px 2px" }}>回主選單</button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {currentChildren.map((node) => (
                <button key={node.id} type="button" onClick={() => void pickNode(node)} disabled={loading}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #cfe6e2", color: NAVY, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, cursor: loading ? "default" : "pointer", textAlign: "left", opacity: loading ? 0.6 : 1 }}>
                  <span style={{ flex: 1 }}>{node.label}</span>
                  <span style={{ color: "#9fb2c2", fontSize: 13 }}>{node.children ? "›" : node.live ? "↻" : "＋"}</span>
                </button>
              ))}
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: LINE_GREEN, color: "#fff", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>💬 加 LINE 問汪汪教練</a>
            </div>
          </div>

          {/* 輸入區 */}
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #e3e9f0", background: "#fff" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="輸入問題…例：體驗潛水多少錢？"
              disabled={loading}
              style={{ flex: 1, border: "1px solid #d6dee7", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, outline: "none" }}
            />
            <button type="button" onClick={() => void send()} disabled={loading || !input.trim()}
              style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 10, padding: "0 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading || !input.trim() ? .5 : 1 }}>送出</button>
          </div>
        </div>
      )}
    </>
  );
}
