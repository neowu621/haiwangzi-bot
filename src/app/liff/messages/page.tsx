"use client";
// v697：LIFF 訊息通知 = 完整複製 m2 MsgTab(通知 + 客服對話),唯一差異:改用 liff.fetchWithAuth(LINE Bearer)
import { useCallback, useEffect, useState } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { C } from "@/components/liff/mobileShared";

interface Notif { id: string; title: string; body: string; createdAt: string; isRead: boolean }
interface Convo { who: "me" | "cs"; body: string; createdAt: string }

export default function LiffMessagesPage() {
  const liff = useLiff();
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [convo, setConvo] = useState<Convo[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const loadConvo = useCallback(() => {
    liff.fetchWithAuth<{ messages?: Convo[] }>("/api/me/contact")
      .then((d) => setConvo(d.messages ?? []))
      .catch(() => {});
  }, [liff]);

  useEffect(() => {
    if (!liff.ready) return;
    liff.fetchWithAuth<{ items?: Notif[] }>("/api/me/notifications?limit=30")
      .then((d) => setNotifs(d.items ?? []))
      .catch(() => setNotifs([]));
    loadConvo();
  }, [liff.ready, loadConvo]);

  async function send() {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      await liff.fetchWithAuth("/api/me/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      setMsg("");
      loadConvo();
    } catch { /* ignore */ } finally { setSending(false); }
  }

  return (
    <LiffShell title="訊息通知" backHref="/liff/home" bottomNav={<BottomNav />}>
      {/* v699：站內訊息(上半) / 發送訊息(下半) 各佔一半 Y 軸,各自獨立捲動 */}
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 152px)", color: C.ink, fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>
        {/* 上半:站內訊息 */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 14px 6px" }}>
          <div style={{ flex: "none", fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 6 }}>站內訊息</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {notifs === null && <div style={{ color: C.mute, fontSize: 13, padding: "10px 0" }}>載入中…</div>}
            {notifs?.length === 0 && <div style={{ color: C.mute, fontSize: 13, padding: "24px 0", textAlign: "center" }}>目前沒有通知</div>}
            {notifs?.map((n) => (
              <div key={n.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: n.isRead ? C.card : "#f0fbfa" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.6, marginTop: 3, whiteSpace: "pre-wrap" }}>{n.body}</div>
                <div style={{ fontSize: 11, color: C.mute, marginTop: 5 }}>{new Date(n.createdAt).toLocaleString("zh-TW")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 下半:發送訊息(客服對話) */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderTop: `1px solid ${C.line}`, background: C.card, padding: "10px 14px 0" }}>
          <div style={{ flex: "none", fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 6 }}>發送訊息給客服</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: 6 }}>
            {convo.length === 0
              ? <div style={{ color: C.mute, fontSize: 12.5, padding: "10px 0", lineHeight: 1.6 }}>有問題就傳訊息給我們，客服會在這裡回覆你。</div>
              : convo.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%", padding: "6px 10px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.who === "me" ? C.navy : C.page, color: m.who === "me" ? "#fff" : C.ink }}>{m.who === "cs" ? `客服：${m.body}` : m.body}</div>
                </div>
              ))}
          </div>
          <div style={{ flex: "none", display: "flex", gap: 8, padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="輸入訊息…" style={{ flex: 1, height: 38, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 10px", fontSize: 14 }} />
            <button onClick={send} disabled={sending || !msg.trim()} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", opacity: sending || !msg.trim() ? 0.5 : 1 }}>送出</button>
          </div>
        </div>
      </div>
    </LiffShell>
  );
}
