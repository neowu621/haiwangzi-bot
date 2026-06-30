"use client";
// v758+：網站 AI 客服浮動小幫手。右下角按鈕 → 展開聊天視窗，打 /api/assistant。
//   輕量、無外部依賴、inline 樣式；行動裝置/LINE WebView 友善。
import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

interface Msg { role: "user" | "assistant"; content: string }

const NAVY = "#0A2342";
const TEAL = "#0e9f93";
const GREET = "嗨！我是海王子潛水的 AI 小幫手 🐠 課程、潛點、潛旅、費用、預約都可以問我～";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: GREET }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // 只在公開行銷頁顯示；後台 /admin、LIFF /liff、/pclogin、教練端不顯示
  const hidden = !!pathname && /^\/(admin|liff|pclogin|coach)(\/|$)/.test(pathname);

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
      {/* 浮動按鈕 */}
      {!open && (
        <button
          type="button"
          aria-label="開啟 AI 客服"
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", right: 16, bottom: 16, zIndex: 9998,
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            background: TEAL, color: "#fff", fontSize: 26, boxShadow: "0 4px 14px rgba(0,0,0,.25)",
          }}
        >💬</button>
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
          <div style={{ background: NAVY, color: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🐠 海王子 AI 小幫手</div>
              <div style={{ fontSize: 11, opacity: .7 }}>潛水課程・潛點・預約諮詢</div>
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
