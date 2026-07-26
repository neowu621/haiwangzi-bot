"use client";
// v903：站內客服「引導問題樹」互動面板（overlay）。
//   點分類 → 點問題 → 看答案 → 「解決了 / 問老闆」。問老闆 → onEscalate 帶入訊息框。
//   每步透過 log() 打點（後台可統計客戶都問什麼）。
import { useState } from "react";
import { CS_TREE, type CsTreeCategory, type CsTreeItem } from "@/lib/cs-tree";
import { C } from "@/components/liff/mobileShared";

type Action = "category" | "answer" | "resolved" | "escalated";

export function CsTree({
  onClose,
  onEscalate,
  log,
}: {
  onClose: () => void;
  onEscalate: (prefill: string) => void;
  log: (action: Action, category: string, questionKey?: string) => void;
}) {
  const [cat, setCat] = useState<CsTreeCategory | null>(null);
  const [item, setItem] = useState<CsTreeItem | null>(null);
  const [done, setDone] = useState<null | "resolved">(null);

  const pickCat = (c: CsTreeCategory) => { setCat(c); setItem(null); setDone(null); log("category", c.key); };
  const pickItem = (it: CsTreeItem) => { setItem(it); setDone(null); if (cat) log("answer", cat.key, it.key); };
  const resolved = () => { setDone("resolved"); if (cat && item) log("resolved", cat.key, item.key); };
  const escalate = () => {
    log("escalated", cat?.key ?? "root", item?.key);
    onEscalate(item ? `想詢問關於「${item.q}」` : "");
    onClose();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,20,30,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "86dvh", background: C.card, borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>
        {/* header */}
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "13px 15px", borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 15 }}>🐬</span>
          <b style={{ fontSize: 14.5, color: C.navy }}>常見問題・快速解答</b>
          <button onClick={onClose} aria-label="關閉" style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 18, color: C.mute }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, background: `linear-gradient(180deg,#f6fafa,${C.card})` }}>
          {/* 麵包屑 */}
          {(cat || item) && (
            <div style={{ fontSize: 11, color: C.mute, marginBottom: 10 }}>
              <span onClick={() => { setCat(null); setItem(null); setDone(null); }} style={{ cursor: "pointer" }}>🏠 首頁</span>
              {cat && <> › <b style={{ color: "#0e4c5a" }} onClick={() => { setItem(null); setDone(null); }}>{cat.label}</b></>}
            </div>
          )}

          {/* 助理泡泡 */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", background: C.navy, color: "#fff", display: "grid", placeItems: "center", fontSize: 14 }}>🔱</div>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: "4px 14px 14px 14px", padding: "10px 12px", fontSize: 13, lineHeight: 1.62, color: C.ink, maxWidth: "86%" }}>
              {done === "resolved" ? "🎉 太好了，很高興幫上忙！還有其他問題可以再點下面。"
                : item ? <><b>{item.q}</b><div style={{ marginTop: 4, color: "#3f5358", fontSize: 12.5, lineHeight: 1.7 }}>{item.a}</div></>
                : cat ? <b>{cat.label}</b>
                : "嗨！想問什麼呢？點下面分類，多數問題可以馬上解答 🐬"}
            </div>
          </div>

          {/* 選項 */}
          {done === "resolved" ? (
            <Btn kind="ok" onClick={() => { setCat(null); setItem(null); setDone(null); }}>回問題選單</Btn>
          ) : item ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.mute, margin: "4px 0 8px", letterSpacing: ".05em" }}>這樣有解決嗎？</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn kind="ok" onClick={resolved}>✅ 解決了</Btn>
                <Btn kind="ask" onClick={escalate}>❌ 還是想問老闆</Btn>
                <Btn kind="back" onClick={() => setItem(null)}>‹ 其他問題</Btn>
              </div>
            </>
          ) : cat ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cat.items.map((it) => <Opt key={it.key} onClick={() => pickItem(it)}>{it.q}</Opt>)}
              <Btn kind="back" onClick={() => setCat(null)}>‹ 返回分類</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CS_TREE.map((c) => <Opt key={c.key} emoji={c.emoji} onClick={() => pickCat(c)}>{c.label}</Opt>)}
              <Opt esc emoji="🙋" onClick={escalate}>以上都沒有，我想直接問老闆</Opt>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Opt({ children, emoji, esc, onClick }: { children: React.ReactNode; emoji?: string; esc?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
      border: `1.5px ${esc ? "dashed" : "solid"} ${C.line}`, background: "#fff", borderRadius: 13,
      padding: "12px 13px", fontSize: 13.5, fontWeight: 600, color: esc ? "#0e4c5a" : C.ink, cursor: "pointer",
    }}>
      {emoji && <span style={{ fontSize: 18, flex: "none" }}>{emoji}</span>}
      <span style={{ flex: 1 }}>{children}</span>
      <span style={{ color: C.mute, fontSize: 15 }}>›</span>
    </button>
  );
}

function Btn({ children, kind, onClick }: { children: React.ReactNode; kind: "ok" | "ask" | "back"; onClick: () => void }) {
  const s: React.CSSProperties = { border: "none", borderRadius: 11, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
  if (kind === "ok") Object.assign(s, { background: "#13b5a6", color: "#04323a" });
  if (kind === "ask") Object.assign(s, { background: "#fff", border: "1.5px solid #ff6b5e", color: "#ff6b5e" });
  if (kind === "back") Object.assign(s, { background: "#fff", border: `1.5px solid ${C.line}`, color: C.mute });
  return <button onClick={onClick} style={s}>{children}</button>;
}
