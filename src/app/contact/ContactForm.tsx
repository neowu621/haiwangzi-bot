"use client";
import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile Site Key（公開）；可用 env 覆寫
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAADk-txif2tm3B2mC";
const LINE_URL = "https://line.me/R/ti/p/@894bpmew";
const PRODUCTS = ["體驗潛水", "OW 考證", "AOW 進階", "1對1 私人", "Fun Dive", "潛水團", "包船", "其他"];
const PLACES = ["綠島", "蘭嶼", "小琉球", "墾丁", "媽媽島", "薄荷島", "其他"];

type Sent = false | "ok";

export function ContactForm() {
  // A 購買疑慮
  const [aTopic, setATopic] = useState("體驗潛水");
  const [aSubject, setASubject] = useState("");
  const [aMsg, setAMsg] = useState("");
  const [aName, setAName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPhone, setAPhone] = useState("");
  const [aHp, setAHp] = useState("");
  const [aBusy, setABusy] = useState(false);
  const [aSent, setASent] = useState<Sent>(false);
  const [aErr, setAErr] = useState("");
  const [aToken, setAToken] = useState("");
  const [aReset, setAReset] = useState(0);

  // B 開團許願
  const [bTopic, setBTopic] = useState("綠島");
  const [bSubject, setBSubject] = useState("");
  const [bWhen, setBWhen] = useState("");
  const [bPeople, setBPeople] = useState("");
  const [bNote, setBNote] = useState("");
  const [bName, setBName] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [bHp, setBHp] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const [bSent, setBSent] = useState<Sent>(false);
  const [bErr, setBErr] = useState("");
  const [bToken, setBToken] = useState("");
  const [bReset, setBReset] = useState(0);

  // 載入 Cloudflare Turnstile script（一次）
  useEffect(() => {
    if (document.getElementById("cf-turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "cf-turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, []);

  async function submit(type: "question" | "wish") {
    const isA = type === "question";
    isA ? setABusy(true) : setBBusy(true);
    isA ? setAErr("") : setBErr("");
    const payload = isA
      ? { type, topic: aTopic, subject: aSubject, message: aMsg, name: aName, email: aEmail, phone: aPhone, hp: aHp, turnstileToken: aToken }
      : { type, topic: bTopic, subject: bSubject, message: bNote, when: bWhen, people: bPeople, name: bName, email: bEmail, phone: bPhone, hp: bHp, turnstileToken: bToken };
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "送出失敗");
      isA ? setASent("ok") : setBSent("ok");
    } catch (e) {
      const m = e instanceof Error ? e.message : "送出失敗";
      isA ? setAErr(m) : setBErr(m);
      // token 單次使用，失敗後重置拿新的
      isA ? setAReset((n) => n + 1) : setBReset((n) => n + 1);
      isA ? setAToken("") : setBToken("");
    } finally {
      isA ? setABusy(false) : setBBusy(false);
    }
  }

  return (
    <div style={{ margin: "0 auto" }}>
      <div className="contact-grid" style={{ display: "grid", gap: 20 }}>
        {/* ===== A 購買疑慮 ===== */}
        <div style={card("#fff6f3", "#f3c6b8")}>
          <div style={cardTop}><div style={icon("#ffe2d8")}>🤔</div><h2 style={{ fontSize: 19, color: "#c0432a", fontWeight: 800 }}>對課程 / 潛旅有疑問</h2></div>
          {aSent === "ok" ? (
            <Done color="#c0432a" text="我們收到你的問題了!會用 Email 回覆你,通常一天內。" />
          ) : (
            <>
              <p style={sub}>還在考慮?選一個方案,把疑問問清楚再決定。</p>
              <Lbl>你在考慮哪一個?</Lbl>
              <Chips items={PRODUCTS} value={aTopic} onPick={setATopic} coral />
              <Lbl>主旨(自動帶入方案,可再補充)</Lbl>
              <FauxInput tag={aTopic} tagBg="#ffe2d8" tagFg="#c0432a" value={aSubject} onChange={setASubject} placeholder="想問費用與天數…" />
              <Lbl>想問什麼?</Lbl>
              <textarea style={ta} value={aMsg} onChange={(e) => setAMsg(e.target.value)} placeholder="例:想帶女友一起體驗,她很怕水,適合嗎?" />
              <Lbl>怎麼聯絡你?</Lbl>
              <input style={inp} value={aName} onChange={(e) => setAName(e.target.value)} placeholder="姓名(怎麼稱呼你)" />
              <div style={two}>
                <input style={inp} value={aEmail} onChange={(e) => setAEmail(e.target.value)} placeholder="Email ＊我們回信用" />
                <input style={inp} value={aPhone} onChange={(e) => setAPhone(e.target.value)} placeholder="電話(選填)" />
              </div>
              <Honeypot value={aHp} onChange={setAHp} />
              <TurnstileWidget onToken={setAToken} resetKey={aReset} />
              {aErr && <div style={errBox}>{aErr}</div>}
              <button style={btn("linear-gradient(135deg,#FF6B4A,#F5522F)", aBusy || !aToken)} disabled={aBusy || !aToken} onClick={() => submit("question")}>{aBusy ? "送出中…" : !aToken ? "驗證中…" : "送出問題 ➤"}</button>
              <p style={note}>送出後進客服信箱,我們用 Email 回你(通常一天內)。急的話用下面的 LINE。</p>
            </>
          )}
        </div>

        {/* ===== B 開團許願 ===== */}
        <div style={card("#eef9f8", "#bfe5e2")}>
          <div style={cardTop}><div style={icon("#d6f0ee")}>🌊</div><h2 style={{ fontSize: 19, color: "#0e7c8a", fontWeight: 800 }}>想去某地 / 想揪團</h2></div>
          {bSent === "ok" ? (
            <Done color="#0e7c8a" text="許願收到了!湊到人或排好行程,我們會優先通知你。" />
          ) : (
            <>
              <p style={sub}>想去但目前沒團?留個許願,湊到人就開、優先通知你。</p>
              <Lbl>想去哪?</Lbl>
              <Chips items={PLACES} value={bTopic} onPick={setBTopic} />
              <Lbl>主旨(自動帶入地點,可再補充)</Lbl>
              <FauxInput tag={bTopic} tagBg="#d6f0ee" tagFg="#0e7c8a" value={bSubject} onChange={setBSubject} placeholder="想揪 7 月中的團…" />
              <Lbl>大概什麼時候?幾個人?</Lbl>
              <div style={two}>
                <input style={inp} value={bWhen} onChange={(e) => setBWhen(e.target.value)} placeholder="例:7 月中" />
                <input style={inp} value={bPeople} onChange={(e) => setBPeople(e.target.value)} placeholder="人數 例:2" />
              </div>
              <Lbl>備註(選填)</Lbl>
              <textarea style={ta} value={bNote} onChange={(e) => setBNote(e.target.value)} placeholder="例:都有 OW,想看大香菇,住宿幫忙安排" />
              <Lbl>怎麼聯絡你?</Lbl>
              <input style={inp} value={bName} onChange={(e) => setBName(e.target.value)} placeholder="姓名(怎麼稱呼你)" />
              <div style={two}>
                <input style={inp} value={bEmail} onChange={(e) => setBEmail(e.target.value)} placeholder="Email" />
                <input style={inp} value={bPhone} onChange={(e) => setBPhone(e.target.value)} placeholder="電話" />
              </div>
              <Honeypot value={bHp} onChange={setBHp} />
              <TurnstileWidget onToken={setBToken} resetKey={bReset} />
              {bErr && <div style={errBox}>{bErr}</div>}
              <button style={btn("linear-gradient(135deg,#0E9AA0,#0a6e73)", bBusy || !bToken)} disabled={bBusy || !bToken} onClick={() => submit("wish")}>{bBusy ? "送出中…" : !bToken ? "驗證中…" : "送出許願 ➤"}</button>
              <p style={note}>送出後進願望單,湊團 / 排好就優先通知你。</p>
            </>
          )}
        </div>
      </div>

      {/* 真人管道 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#f4f8f9", border: "1px solid #e1ebeb", borderRadius: 14, padding: "16px 22px", marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0A2342" }}>急著問?直接找真人 →</span>
        <a href={LINE_URL} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "#06C755", color: "#fff", borderRadius: 11, padding: "11px 20px", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
          <span style={{ width: 21, height: 21, background: "#fff", borderRadius: 5, color: "#06C755", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>L</span>LINE 問汪汪教練(最快)
        </a>
        <span style={{ fontSize: 13, color: "#516268" }}>或 Email：<b style={{ color: "#0e7c8a", fontFamily: "monospace" }}>service@haiwangzi.xyz</b></span>
      </div>

      <style>{`@media (min-width:900px){.contact-grid{grid-template-columns:1fr 1fr}}`}</style>
    </div>
  );
}

// ── sub-components ──
function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "#0A2342", margin: "13px 0 8px" }}>{children}</div>;
}
function Chips({ items, value, onPick, coral }: { items: string[]; value: string; onPick: (v: string) => void; coral?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((it) => {
        const on = it === value;
        const bg = on ? (coral ? "#FF6B4A" : "#0E9AA0") : "#fff";
        const bc = on ? bg : "#cfe0e0";
        return (
          <button key={it} type="button" onClick={() => onPick(it)} style={{ fontSize: 13, padding: "7px 14px", borderRadius: 22, border: `1.5px solid ${bc}`, background: bg, color: on ? "#fff" : "#0e7c8a", fontWeight: on ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>{it}</button>
        );
      })}
    </div>
  );
}
function FauxInput({ tag, tagBg, tagFg, value, onChange, placeholder }: { tag: string; tagBg: string; tagFg: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, border: "1.5px solid #dce7ea", borderRadius: 10, padding: "7px 9px", background: "#fff" }}>
      <span style={{ fontWeight: 700, borderRadius: 6, padding: "3px 9px", fontSize: 12.5, background: tagBg, color: tagFg, flex: "none", whiteSpace: "nowrap" }}>{tag}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent", color: "#0f2430", minWidth: 0 }} />
    </div>
  );
}
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}
function getTurnstile(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}
function TurnstileWidget({ onToken, resetKey }: { onToken: (t: string) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  useEffect(() => {
    let done = false;
    const tryRender = () => {
      const ts = getTurnstile();
      if (done || !ref.current || !ts || idRef.current) return false;
      idRef.current = ts.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
      return true;
    };
    if (!tryRender()) {
      const iv = setInterval(() => { if (tryRender()) clearInterval(iv); }, 250);
      return () => { done = true; clearInterval(iv); };
    }
    return () => { done = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const ts = getTurnstile();
    if (resetKey > 0 && ts && idRef.current) { ts.reset(idRef.current); onToken(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  return <div ref={ref} style={{ marginTop: 12 }} />;
}
function Done({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 10px" }}>
      <div style={{ fontSize: 40 }}>✅</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 8 }}>已送出!</div>
      <p style={{ fontSize: 13.5, color: "#516268", marginTop: 8, lineHeight: 1.7 }}>{text}</p>
    </div>
  );
}

// ── styles ──
function card(bg: string, bc: string): React.CSSProperties {
  return { background: bg, border: `1.5px solid ${bc}`, borderRadius: 16, padding: 22 };
}
const cardTop: React.CSSProperties = { display: "flex", alignItems: "center", gap: 11, marginBottom: 4 };
function icon(bg: string): React.CSSProperties {
  return { width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", fontSize: 24, flex: "none", background: bg };
}
const sub: React.CSSProperties = { fontSize: 13, color: "#516268", lineHeight: 1.6, marginBottom: 12 };
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #dce7ea", borderRadius: 10, padding: "11px 13px", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#0f2430", outline: "none" };
const ta: React.CSSProperties = { ...inp, minHeight: 64, resize: "vertical", lineHeight: 1.6 };
const two: React.CSSProperties = { display: "flex", gap: 12, marginTop: 9 };
const note: React.CSSProperties = { fontSize: 12, color: "#7c9296", marginTop: 10, lineHeight: 1.6 };
const errBox: React.CSSProperties = { background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginTop: 12 };
function btn(bg: string, busy: boolean): React.CSSProperties {
  return { width: "100%", marginTop: 14, border: "none", borderRadius: 12, padding: 14, fontSize: 15.5, fontWeight: 700, color: "#fff", background: busy ? "#cdd9d9" : bg, fontFamily: "inherit", cursor: busy ? "wait" : "pointer" };
}
