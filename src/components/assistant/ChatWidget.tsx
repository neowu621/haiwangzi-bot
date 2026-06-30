"use client";
// v758+：網站 AI 客服浮動小幫手。右下角按鈕 → 展開聊天視窗，打 /api/assistant。
//   輕量、無外部依賴、inline 樣式；行動裝置/LINE WebView 友善。
import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

interface Msg { role: "user" | "assistant"; content: string }

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const GREET = "嗨！我是海王子潛水的 AI 小幫手 🐠 課程、潛點、潛旅、費用、預約都可以問我～";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // 只放在桌機首頁 `/`。真人手機會被 proxy 導到 `/mobile`，因此不顯示小幫手，避免 LINE WebView/手機首屏變重。
  const hidden = pathname !== "/";

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, loading]);

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
                  maxWidth: "82%", padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: m.role === "user" ? TEAL : "#fff",
                  color: m.role === "user" ? "#fff" : NAVY,
                  border: m.role === "user" ? "none" : "1px solid #e3e9f0",
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                <div style={{ padding: "8px 11px", borderRadius: 12, fontSize: 13.5, background: "#fff", color: "#8595a6", border: "1px solid #e3e9f0" }}>輸入中…</div>
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
