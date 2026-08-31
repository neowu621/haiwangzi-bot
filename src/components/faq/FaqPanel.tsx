"use client";
// v1074：點選式 FAQ 面板（零 AI、零 API key）。
//   前身是 v758~v803 的 assistant/ChatWidget，v1072 隨 AI 客服整組刪除；
//   這裡只救回「不經過 AI」的導引式選單那一半：
//     ✅ 三層下鑽選單（純靜態常數 → 零 DB）
//     ✅ 結構化答案卡（課程/潛點價格）
//     ✅ 即時資料（場次空位/潛旅/裝備價/政策）—— 打既有公開 API，皆有版本號快取
//     ❌ 不回來：AI 對話、輸入框、打字機、👍👎 回饋、主動招呼 teaser
//
//   ⚠️ 本檔是「重的那一半」，由 FaqLauncher 以 next/dynamic 在使用者點開時才載入，
//      首屏不背這段 JS（行動裝置前端鐵則）。
import { useState, useRef, useEffect, useCallback } from "react";
import { FAQ_MENU, LINE_URL, type MenuNode, type MenuLink, type AnswerCard, type LiveKind } from "@/lib/faq-menu";
import { DiverLoader } from "@/components/ui/DiverLoader";

interface TripCard { date: string; wd: string; time: string; sites: string; boat: boolean; tanks: string; seat: string; full: boolean }
interface Msg {
  role: "user" | "assistant";
  content: string;
  card?: AnswerCard;
  links?: MenuLink[];
  tripCards?: TripCard[];
}

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const LINE_GREEN = "#06C755";
const GREET = "嗨！點下面就能找答案 🐠\n找不到的話，右上角可以直接問教練。";
const STORE_KEY = "hwz_faq_v1074";

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

/**
 * 拿公開 API 的 JSON。必須擋 `!r.ok` —— 不擋的話，伺服器 500 時
 * `data.trips ?? []` 會變成空陣列，客人會看到「這段期間沒有場次」——
 * 明明是系統壞了卻跟客人講了一句不是事實的話。寧可跳到 catch 說「查詢出問題」。
 */
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return (await r.json()) as T;
}

/** 即時節點：直接打既有公開 API（版本號快取，命中零 DB）。 */
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
    const data = await getJson<{ trips?: TripLite[] }>(`/api/trips?from=${from}&to=${to}`);
    const trips = data.trips ?? [];
    const links: MenuLink[] = [{ label: "打開完整場次表", href: "/schedule" }, { label: "線上詢問", href: "/contact" }];
    if (trips.length === 0) return { content: `${head}\n這段期間目前沒有開放預約的場次 😅 可以加 LINE 問汪汪教練，或許願開團！`, links };
    return { content: head, links, tripCards: toTripCards(trips) };
  }
  if (kind === "tours") {
    const data = await getJson<{ tours?: TourLite[] }>("/api/tours");
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
    const data = await getJson<{ gearRentalPrices?: Record<string, number>; defaultTripPricing?: { baseTrip?: number; extraTank?: number; nightDive?: number; scooterRental?: number } }>("/api/site-config");
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
  const data = await getJson<{ cancellationPolicy?: string; safetyPolicy?: string }>("/api/config");
  if (kind === "cancel") {
    const text = (data.cancellationPolicy ?? "").trim();
    return { content: text || "取消／退款細節請加 LINE 跟汪汪教練確認 🙂" };
  }
  const text = (data.safetyPolicy ?? "").trim();
  return { content: text || "安全須知細節請加 LINE 跟汪汪教練確認 🙂" };
}

export default function FaqPanel({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: GREET }]);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<MenuNode[]>([]); // 選單下鑽路徑（空=主選單）
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);
  useEffect(() => { scrollBottom(); }, [msgs, loading, scrollBottom]);

  // 瀏覽紀錄保存（sessionStorage）— 關頁籤才消失，重新整理/切頁保留
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { msgs?: Msg[] };
        if (saved.msgs?.length) setMsgs(saved.msgs);
      }
    } catch { /* ignore */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ msgs })); } catch { /* ignore */ }
  }, [msgs, restored]);

  // 目前這一層要顯示的選單按鈕（空路徑=主選單）
  const currentChildren = (path.length ? path[path.length - 1].children : FAQ_MENU) ?? [];

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
  const reset = useCallback(() => {
    setMsgs([{ role: "assistant", content: GREET }]);
    setPath([]);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, []);

  const chipStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    background: "#fff", border: "1px solid #cfe6e2", color: NAVY,
    borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", textAlign: "left", lineHeight: 1.3,
  };

  return (
    <div
      role="dialog"
      aria-label="常見問題"
      style={{
        position: "fixed", right: 12, bottom: 12, zIndex: 9999,
        width: "min(390px, calc(100vw - 24px))", height: "min(640px, calc(100vh - 24px))",
        display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16,
        overflow: "hidden", boxShadow: "0 10px 36px rgba(0,0,0,.28)",
        fontFamily: "-apple-system,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
      }}
    >
      {/* header：標題 + 找教練(真人) + 重來 + 關閉 */}
      <div style={{ background: NAVY, color: "#fff", padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{
          width: 34, height: 34, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 17,
          background: "radial-gradient(circle at 35% 25%, #7ff7ee 0%, #0e9f93 52%, #075f67 100%)",
        }}>💬</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>常見問題</div>
          <div style={{ fontSize: 11, opacity: .76 }}>課程・潛點・場次・預約</div>
        </div>
        <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: LINE_GREEN, color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          💬 找教練
        </a>
        <button type="button" aria-label="重新開始" title="重新開始" onClick={reset}
          style={{ background: "transparent", border: "none", color: "#9fb6cd", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: 4 }}>↺</button>
        <button type="button" aria-label="關閉" onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 2 }}>×</button>
      </div>

      {/* 單一捲軸：訊息 + 載入中 + 選單按鈕全部在同一條流 */}
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
              {m.content && <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>}
              {/* 場次卡片（日期・潛點・剩位・預約 CTA） */}
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
              {m.links && m.links.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.links.map((l, j) => (
                    <a key={j} href={l.href}
                      {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eef7f5", color: "#075f67", border: "1px solid #cfe6e2", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>{l.label} ›</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 12, background: "#fff", border: "1px solid #e3e9f0" }}>
              <DiverLoader size={40} />
              <span style={{ fontSize: 12.5, color: "#8595a6" }}>查詢中…</span>
            </div>
          </div>
        )}

        {/* 選單按鈕（併入同一條捲軸；點分支下鑽、點葉子出答案） */}
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
    </div>
  );
}
