"use client";
// v758+：網站 AI 客服浮動小幫手。右下角按鈕 → 展開聊天視窗。
//   v771：導引式選單三層漏斗（零 token）；即時資料直接打公開 API（版本號快取）。
//   v803：全面改版（P0-P2）——
//     P0：選單併入聊天流（chips 快速回覆、單一捲軸）；開放手機/全站公開頁（手機全螢幕）；
//         「找教練(真人)」常駐 header。
//     P1：對話保存(sessionStorage)+清除；AI 回覆打字機效果+小螃蟹思考中；場次卡片(含預約 CTA)。
//     P2：主動招呼 teaser(進站 10 秒、當日關閉不再出現)+未讀紅點；每則 AI 回答 👍👎 回饋
//         (記入通訊紀錄，👎 自動建議轉 LINE 真人)。
import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ASSISTANT_MENU, LINE_URL, type MenuNode, type MenuLink, type AnswerCard, type LiveKind } from "@/lib/assistant-menu";
import { DiverLoader } from "@/components/ui/DiverLoader";

interface TripCard { date: string; wd: string; time: string; sites: string; boat: boolean; tanks: string; seat: string; full: boolean }
interface Msg {
  role: "user" | "assistant";
  content: string;
  card?: AnswerCard;
  links?: MenuLink[];
  tripCards?: TripCard[];
  /** 由 AI 生成（可回饋 👍👎）*/
  ai?: boolean;
  feedback?: "up" | "down";
  /** 打字機效果進行中 */
  tw?: boolean;
}

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const LINE_GREEN = "#06C755";
const GREET = "嗨！我是海王子潛水的 AI 小幫手 🐠 點下面就能找答案，也可以直接打字問我～";
const STORE_KEY = "hwz_chat_v803";

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

function toTripCards(trips: TripLite[]): TripCard[] {
  return trips.map((t) => ({
    date: t.date,
    wd: weekdayOf(t.date),
    time: t.startTime,
    sites: (t.sites ?? []).map((s) => s.name).filter(Boolean).join("、") || "東北角",
    boat: !!t.isBoat,
    tanks: String(t.tankCount ?? "-"),
    seat: t.available == null ? "可預約" : t.available <= 0 ? "已滿" : `剩 ${t.available} 位`,
    full: t.available != null && t.available <= 0,
  }));
}

/** 即時節點：直接打既有公開 API（版本號快取，命中零 DB），完全不經過 AI／不耗 token。 */
async function fetchLive(kind: LiveKind): Promise<{ content: string; links?: MenuLink[]; tripCards?: TripCard[] }> {
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
    return { content: head, links, tripCards: toTripCards(trips) };
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
      .hwz-bot { position: relative; display: inline-block; flex: 0 0 auto; animation: hwz-bot-float 2.8s ease-in-out infinite; transform-origin: 50% 70%; }
      .hwz-bot-compact { animation-duration: 3.1s; }
      .hwz-bot-shadow { position: absolute; left: 17%; right: 17%; bottom: 1%; height: 10%; border-radius: 999px; background: rgba(4, 18, 34, .22); filter: blur(3px); animation: hwz-bot-shadow 2.8s ease-in-out infinite; }
      .hwz-bot-head { position: absolute; inset: 16% 9% 12%; border-radius: 38% 38% 44% 44%; background: radial-gradient(circle at 28% 18%, rgba(255,255,255,.95) 0 8%, transparent 9%), linear-gradient(150deg, #e9fbff 0%, #76dce5 44%, #0e9f93 100%); border: 2px solid rgba(255,255,255,.88); box-shadow: inset -8px -10px 18px rgba(5, 78, 93, .24), 0 8px 18px rgba(1, 44, 64, .24); }
      .hwz-bot-glass { position: absolute; left: 17%; right: 17%; top: 25%; height: 29%; border-radius: 999px; background: linear-gradient(180deg, #12365f, #071f3a); border: 1px solid rgba(255,255,255,.55); display: flex; align-items: center; justify-content: center; gap: 17%; overflow: hidden; }
      .hwz-bot-glass::before { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 0 18%, rgba(255,255,255,.26) 31%, transparent 45%); animation: hwz-bot-scan 3.6s ease-in-out infinite; }
      .hwz-bot-eye { position: relative; z-index: 1; border-radius: 999px; background: #83fff5; box-shadow: 0 0 10px rgba(131,255,245,.9); animation: hwz-bot-blink 4.2s infinite; }
      .hwz-bot-smile { position: absolute; left: 39%; right: 39%; top: 63%; height: 8%; border-bottom: 2px solid rgba(7,31,58,.55); border-radius: 0 0 999px 999px; }
      .hwz-bot-antenna { position: absolute; left: 50%; top: 0; width: 2px; height: 20%; transform: translateX(-50%); background: rgba(255,255,255,.75); }
      .hwz-bot-antenna span { position: absolute; left: 50%; top: -5px; width: 10px; height: 10px; transform: translateX(-50%); border-radius: 999px; background: #ffbf3c; box-shadow: 0 0 0 5px rgba(255,191,60,.18), 0 0 14px rgba(255,191,60,.8); animation: hwz-bot-pulse 1.8s ease-in-out infinite; }
      .hwz-bot-fin { position: absolute; top: 49%; width: 18%; height: 23%; border-radius: 70% 28% 70% 28%; background: linear-gradient(180deg, #ffcf63, #ff7b5a); box-shadow: 0 5px 12px rgba(255,123,90,.24); }
      .hwz-bot-fin-left { left: 1%; transform: rotate(-25deg); animation: hwz-bot-fin-left 1.9s ease-in-out infinite; }
      .hwz-bot-fin-right { right: 1%; transform: scaleX(-1) rotate(-25deg); animation: hwz-bot-fin-right 1.9s ease-in-out infinite; }
      .hwz-bot-bubble { position: absolute; border: 1px solid rgba(255,255,255,.8); border-radius: 999px; background: rgba(142, 245, 255, .25); opacity: 0; }
      .hwz-bot-bubble-one { right: 0; top: 38%; width: 8px; height: 8px; animation: hwz-bot-bubble 2.4s ease-in infinite; }
      .hwz-bot-bubble-two { right: 9%; top: 28%; width: 5px; height: 5px; animation: hwz-bot-bubble 2.4s .7s ease-in infinite; }
      @keyframes hwz-bot-float { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-7px) rotate(2deg); } }
      @keyframes hwz-bot-shadow { 0%, 100% { transform: scaleX(.9); opacity: .52; } 50% { transform: scaleX(1.14); opacity: .3; } }
      @keyframes hwz-bot-pulse { 0%, 100% { transform: translateX(-50%) scale(.9); } 50% { transform: translateX(-50%) scale(1.15); } }
      @keyframes hwz-bot-blink { 0%, 45%, 52%, 100% { transform: scaleY(1); } 48% { transform: scaleY(.18); } }
      @keyframes hwz-bot-scan { 0%, 45% { transform: translateX(-120%); } 70%, 100% { transform: translateX(120%); } }
      @keyframes hwz-bot-fin-left { 0%, 100% { transform: rotate(-25deg); } 50% { transform: rotate(-38deg) translateY(2px); } }
      @keyframes hwz-bot-fin-right { 0%, 100% { transform: scaleX(-1) rotate(-25deg); } 50% { transform: scaleX(-1) rotate(-38deg) translateY(2px); } }
      @keyframes hwz-bot-bubble { 0% { transform: translate(0, 0) scale(.7); opacity: 0; } 20% { opacity: .85; } 100% { transform: translate(11px, -30px) scale(1.2); opacity: 0; } }
      /* v803：手機（≤640px）聊天面板改全螢幕 bottom-sheet */
      @media (max-width: 640px) {
        .hwz-chat-panel {
          right: 0 !important; bottom: 0 !important; left: 0 !important;
          width: 100vw !important; height: 100dvh !important;
          border-radius: 0 !important; max-height: none !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .hwz-bot, .hwz-bot *, .hwz-bot::before, .hwz-bot::after { animation: none !important; }
      }
    `}</style>
  );
}

/** v803：AI 回覆打字機效果（回覆已完整取得，逐字呈現；結束後 onDone 顯示回饋鈕） */
function TypeText({ text, onTick, onDone }: { text: string; onTick: () => void; onDone: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      if (!doneRef.current) { doneRef.current = true; onDone(); }
      return;
    }
    if (n >= text.length) {
      if (!doneRef.current) { doneRef.current = true; onDone(); }
      return;
    }
    const t = setTimeout(() => { setN((v) => Math.min(text.length, v + 3)); onTick(); }, 24);
    return () => clearTimeout(t);
  }, [n, text, onTick, onDone]);
  return <span style={{ whiteSpace: "pre-wrap" }}>{text.slice(0, n)}</span>;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: GREET }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true); // v764：後台可停用
  const [path, setPath] = useState<MenuNode[]>([]); // v771：選單下鑽路徑（空=主選單）
  const [teaser, setTeaser] = useState(false); // v803：主動招呼泡泡
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // v803：公開行銷頁都顯示（桌機首頁 / 手機首頁 / 場次表）；後台/LIFF/pclogin/付款頁不顯示。
  const onPublic = pathname === "/" || pathname === "/mobile" || pathname === "/schedule";
  const hidden = !onPublic || !botEnabled;

  const scrollBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { if (open) scrollBottom(); }, [msgs, open, loading, scrollBottom]);

  // v803：對話保存（sessionStorage）— 關頁籤才消失，重新整理/切頁保留
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { msgs?: Msg[] };
        if (saved.msgs?.length) setMsgs(saved.msgs.map((m) => ({ ...m, tw: false })));
      }
    } catch { /* ignore */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ msgs: msgs.map((m) => ({ ...m, tw: false })) })); } catch { /* ignore */ }
  }, [msgs, restored]);

  // v764：抓後台設定（是否啟用 + 自訂招呼語）
  useEffect(() => {
    if (!onPublic) return;
    let alive = true;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; greeting?: string }) => {
        if (!alive) return;
        if (d.enabled === false) setBotEnabled(false);
        if (d.greeting) setMsgs((m) => (m.length === 1 && !m[0].ai ? [{ role: "assistant", content: d.greeting as string }] : m));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [onPublic]);

  // v803：主動招呼 teaser — 進站 10 秒未開啟 → 冒泡；關閉後當日不再出現
  useEffect(() => {
    if (hidden || open) return;
    const key = `hwz_teaser_${tzToday()}`;
    try { if (localStorage.getItem(key)) return; } catch { /* ignore */ }
    const t = setTimeout(() => setTeaser(true), 10_000);
    return () => clearTimeout(t);
  }, [hidden, open]);
  const dismissTeaser = useCallback((remember: boolean) => {
    setTeaser(false);
    if (remember) { try { localStorage.setItem(`hwz_teaser_${tzToday()}`, "1"); } catch { /* ignore */ } }
  }, []);

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
      const reply = data.reply || data.error || "暫時無法回覆，請加 LINE @894bpmew 詢問 🙂";
      setMsgs((m) => [...m, { role: "assistant", content: reply, ai: Boolean(data.reply), tw: Boolean(data.reply) }]);
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
        const { content, links, tripCards } = await fetchLive(node.live);
        setMsgs((m) => [...m, { role: "assistant", content, links, tripCards }]);
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

  // v803：清除對話
  const clearChat = useCallback(() => {
    if (!window.confirm("清除這次的對話紀錄？")) return;
    setMsgs([{ role: "assistant", content: GREET }]);
    setPath([]);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, []);

  // v803：👍👎 回饋 — 記入通訊紀錄；👎 自動建議轉真人
  const giveFeedback = useCallback((idx: number, verdict: "up" | "down") => {
    setMsgs((m) => {
      const target = m[idx];
      if (!target || target.feedback) return m;
      const question = [...m].slice(0, idx).reverse().find((x) => x.role === "user")?.content ?? "(未知問題)";
      void fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.slice(0, 500), answer: target.content.slice(0, 2000), verdict }),
      }).catch(() => {});
      const next = m.map((x, i) => (i === idx ? { ...x, feedback: verdict } : x));
      if (verdict === "down") {
        next.push({
          role: "assistant",
          content: "抱歉沒幫上忙 🙏 這題直接找汪汪教練最快！",
          links: [{ label: "💬 加 LINE 找教練（真人）", href: LINE_URL }],
        });
      }
      return next;
    });
  }, []);

  const markTyped = useCallback((idx: number) => {
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, tw: false } : x)));
  }, []);

  if (hidden) return null;

  const chipStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    background: "#fff", border: "1px solid #cfe6e2", color: NAVY,
    borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", textAlign: "left", lineHeight: 1.3,
  };

  return (
    <>
      <BotStyles />
      {/* v803：主動招呼 teaser 泡泡 */}
      {!open && teaser && (
        <div style={{ position: "fixed", right: 100, bottom: 34, zIndex: 9998, maxWidth: 230, background: "#fff", border: "1px solid #d7e5ef", borderRadius: "14px 14px 2px 14px", boxShadow: "0 8px 24px rgba(0,40,66,.18)", padding: "10px 12px", fontSize: 13, color: NAVY, lineHeight: 1.5 }}>
          <button type="button" aria-label="關閉提示" onClick={() => dismissTeaser(true)}
            style={{ position: "absolute", top: 2, right: 6, background: "transparent", border: "none", color: "#9fb2c2", fontSize: 14, cursor: "pointer" }}>×</button>
          <button type="button" onClick={() => { dismissTeaser(false); setOpen(true); }}
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}>
            嗨～想查<b>週末場次</b>或<b>課程費用</b>嗎？點我馬上告訴你 🐠
          </button>
        </div>
      )}
      {/* 浮動鈕 */}
      {!open && (
        <button
          type="button"
          aria-label="開啟 AI 客服"
          onClick={() => { setOpen(true); dismissTeaser(false); }}
          style={{
            position: "fixed", right: 16, bottom: 16, zIndex: 9998,
            width: 74, height: 74, borderRadius: "50%", border: "1px solid rgba(255,255,255,.68)", cursor: "pointer",
            background: "radial-gradient(circle at 35% 25%, #7ff7ee 0%, #0e9f93 52%, #075f67 100%)",
            color: "#fff", boxShadow: "0 10px 28px rgba(0,64,86,.34)",
            display: "grid", placeItems: "center", padding: 0,
          }}
        >
          <BotMascot />
          {/* v803：未讀紅點（teaser 出現時） */}
          {teaser && <span aria-hidden style={{ position: "absolute", top: 4, right: 6, width: 13, height: 13, borderRadius: "50%", background: "#ff5a4e", border: "2px solid #fff" }} />}
        </button>
      )}

      {/* 聊天面板 */}
      {open && (
        <div
          role="dialog"
          aria-label="AI 客服對話"
          className="hwz-chat-panel"
          style={{
            position: "fixed", right: 12, bottom: 12, zIndex: 9999,
            width: "min(390px, calc(100vw - 24px))", height: "min(640px, calc(100vh - 24px))",
            display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16,
            overflow: "hidden", boxShadow: "0 10px 36px rgba(0,0,0,.28)",
            fontFamily: "-apple-system,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
          }}
        >
          {/* header：標題 + 找教練(真人) + 清除 + 關閉 */}
          <div style={{ background: NAVY, color: "#fff", padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <BotMascot compact />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>海王子 AI 小幫手</div>
              <div style={{ fontSize: 11, opacity: .76 }}>潛水課程・潛點・預約諮詢</div>
            </div>
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: LINE_GREEN, color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
              💬 找教練
            </a>
            <button type="button" aria-label="清除對話" title="清除對話" onClick={clearChat}
              style={{ background: "transparent", border: "none", color: "#9fb6cd", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 4 }}>🗑</button>
            <button type="button" aria-label="關閉" onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 2 }}>×</button>
          </div>

          {/* v803：單一捲軸——訊息 + 思考中 + 快速回覆 chips 全部在同一條流 */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, background: "#f4f7fa" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{
                  maxWidth: m.role === "user" ? "82%" : "94%", padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6, wordBreak: "break-word",
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
                  {m.content && (
                    m.tw
                      ? <TypeText text={m.content} onTick={scrollBottom} onDone={() => markTyped(i)} />
                      : <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                  )}
                  {/* v803：場次卡片（日期・潛點・剩位・預約 CTA） */}
                  {m.tripCards && m.tripCards.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {m.tripCards.map((t, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f7fbfa", border: "1px solid #dcebe8", borderRadius: 10, padding: "7px 9px" }}>
                          <div style={{ textAlign: "center", flex: "none", minWidth: 52 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: NAVY }}>{t.date.slice(5).replace("-", "/")}</div>
                            <div style={{ fontSize: 10.5, color: "#6b7b8c" }}>週{t.wd}・{t.time}</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sites}</div>
                            <div style={{ fontSize: 11, color: "#6b7b8c" }}>{t.boat ? "🚤 船潛" : "🏖 岸潛"}・{t.tanks} 潛</div>
                          </div>
                          <div style={{ flex: "none", textAlign: "right" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: t.full ? "#c05555" : TEAL, marginBottom: 3 }}>{t.seat}</div>
                            {!t.full && (
                              <a href="/schedule" style={{ display: "inline-block", background: TEAL, color: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>預約 ›</a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 可點連結 */}
                  {m.links && m.links.length > 0 && !m.tw && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {m.links.map((l, j) => (
                        <a key={j} href={l.href}
                          {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eef7f5", color: "#075f67", border: "1px solid #cfe6e2", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>{l.label} ›</a>
                      ))}
                    </div>
                  )}
                </div>
                {/* v803：AI 回答的 👍👎 回饋（打字完才顯示） */}
                {m.role === "assistant" && m.ai && !m.tw && (
                  <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                    {m.feedback ? (
                      <span style={{ fontSize: 11, color: "#8ba0b3" }}>{m.feedback === "up" ? "感謝回饋 🙌" : "已收到，幫你找真人 🙏"}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: "#9fb2c2" }}>有幫到你嗎？</span>
                        <button type="button" aria-label="有幫助" onClick={() => giveFeedback(i, "up")}
                          style={{ background: "#fff", border: "1px solid #e3e9f0", borderRadius: 999, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>👍</button>
                        <button type="button" aria-label="沒幫助" onClick={() => giveFeedback(i, "down")}
                          style={{ background: "#fff", border: "1px solid #e3e9f0", borderRadius: 999, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}>👎</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* v803：思考中 = 小螃蟹 */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 12, background: "#fff", border: "1px solid #e3e9f0" }}>
                  <DiverLoader size={40} />
                  <span style={{ fontSize: 12.5, color: "#8595a6" }}>小幫手思考中…</span>
                </div>
              </div>
            )}

            {/* v803：快速回覆 chips（併入聊天流，單一捲軸；點分支下鑽、點葉子出答案） */}
            {!loading && (
              <div style={{ marginTop: 4 }}>
                {path.length > 0 && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                    <button type="button" onClick={goBack}
                      style={{ background: "transparent", border: "none", color: "#5f7385", fontSize: 12, cursor: "pointer", padding: 0 }}>‹ 回上一層</button>
                    <button type="button" onClick={goHome}
                      style={{ background: "transparent", border: "none", color: "#5f7385", fontSize: 12, cursor: "pointer", padding: 0 }}>⌂ 主選單</button>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {currentChildren.map((node) => (
                    <button key={node.id} type="button" onClick={() => void pickNode(node)} style={chipStyle}>
                      {node.label}
                      <span style={{ color: "#9fb2c2" }}>{node.children ? "›" : ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 輸入區 */}
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #e3e9f0", background: "#fff" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="輸入問題…例：體驗潛水多少錢？"
              disabled={loading}
              style={{ flex: 1, minWidth: 0, border: "1px solid #d6dee7", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, outline: "none" }}
            />
            <button type="button" onClick={() => void send()} disabled={loading || !input.trim()}
              style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 10, padding: "0 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading || !input.trim() ? .5 : 1 }}>送出</button>
          </div>
        </div>
      )}
    </>
  );
}
