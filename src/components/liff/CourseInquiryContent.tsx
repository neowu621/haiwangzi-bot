"use client";
// v749：課程詢問（潛水預約整合頁第 4 個分頁，預覽用 /course-inquiry）。
//   上半：目前課程內容說明（取自 _home/data 的 COURSES）。
//   下半：需求訊息表單 → POST /api/contact（type=question）一次寫入「客服信箱(站內訊息)」＋Email 通知老闆＋LINE 推播給老闆。
//   另提供「用 LINE 直接問老闆」即時管道。沿用 /contact 的 Cloudflare Turnstile + honeypot 防濫發。
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { COURSES } from "@/app/_home/data";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAADk-txif2tm3B2mC";
const LINE_URL = "https://line.me/R/ti/p/@894bpmew";

export function CourseInquiryContent() {
  const [course, setCourse] = useState<string>(COURSES[0].title);
  const [message, setMessage] = useState<string>(COURSES[0].msg);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState("");
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

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

  function pickCourse(c: { title: string; msg: string }) {
    setCourse(c.title);
    setMessage(c.msg);
  }

  const isValid = name.trim() && email.trim() && message.trim() && token;

  async function submit() {
    if (!isValid) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "question",
          topic: course,
          subject: `課程詢問：${course}`,
          message,
          name,
          email,
          phone,
          hp,
          turnstileToken: token,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "送出失敗");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送出失敗");
      setReset((n) => n + 1);
      setToken("");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="px-4 pt-10 pb-28 text-center">
        <div className="text-5xl">✅</div>
        <div className="mt-3 text-lg font-bold text-[var(--color-ocean-deep)]">課程詢問已送出！</div>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] leading-relaxed">
          已進客服信箱，老闆會用 Email 回覆你（通常一天內）。<br />急的話也可以直接 LINE 問。
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a href={LINE_URL} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="w-full" style={{ background: "#06C755", color: "#fff" }}>💬 用 LINE 問老闆</Button>
          </a>
          <Button variant="outline" size="lg" className="w-full" onClick={() => { setDone(false); setMessage(""); }}>再問一筆</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4 pb-28">
      <div className="rounded-lg bg-[var(--color-phosphor)]/10 p-3 text-xs text-[var(--color-ocean-deep)]">
        🎓 想上課但還在猶豫？看看課程內容，把問題直接傳給老闆，會用 Email／LINE 回覆你。
      </div>

      {/* ── 目前課程內容說明 ── */}
      <div className="text-sm font-bold text-[var(--color-ocean-deep)] px-1">目前課程內容</div>
      {COURSES.map((c) => (
        <Card key={c.title}><CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-full bg-[var(--color-ocean-deep)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-phosphor)]">{c.badge}</span>
            <span className={`text-base font-extrabold ${c.price.startsWith("NT$") ? "text-[var(--color-ocean-deep)]" : "text-[var(--color-phosphor)]"}`}>{c.price}</span>
          </div>
          <div className="mt-1.5 text-[15px] font-bold text-[var(--foreground)]">{c.title}</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-2">{c.includes}</div>
          <ul className="space-y-1">
            {c.items.map((it, i) => (
              <li key={i} className={`text-[12.5px] leading-relaxed ${it.hl ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>・{it.t}</li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => { pickCourse(c); if (typeof window !== "undefined") document.getElementById("course-inquiry-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            詢問這個課程 ↓
          </Button>
        </CardContent></Card>
      ))}

      {/* ── 需求訊息 ── */}
      <div id="course-inquiry-form" className="text-sm font-bold text-[var(--color-ocean-deep)] px-1 pt-2">把需求傳給老闆</div>

      <Card><CardContent className="p-4 space-y-3">
        <div>
          <Label className="text-sm font-semibold mb-2 block">想詢問的課程</Label>
          <div className="flex flex-wrap gap-1.5">
            {COURSES.map((c) => (
              <button key={c.title} type="button" onClick={() => pickCourse(c)}
                className={`rounded-full border px-3 py-1.5 text-xs ${course === c.title ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 font-semibold" : "border-[var(--border)]"}`}>
                {c.title}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="ci-msg" className="text-sm font-semibold"><span className="text-rose-600">＊</span>想問什麼？</Label>
          <textarea id="ci-msg" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))} rows={4}
            placeholder="例：想帶女友一起，她很怕水適合嗎？平日晚上可以上課嗎？"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          <div className="mt-1 text-[10px] text-right text-[var(--muted-foreground)]">{message.length} / 2000</div>
        </div>

        <div>
          <Label className="text-sm font-semibold"><span className="text-rose-600">＊</span>怎麼稱呼你 / 聯絡方式</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名（怎麼稱呼你）" className="mt-1" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email ＊回信用" inputMode="email" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="電話（選填）" inputMode="tel" />
          </div>
        </div>

        {/* honeypot（防機器人） */}
        <input value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <TurnstileWidget onToken={setToken} resetKey={reset} />
      </CardContent></Card>

      {err && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      <Button variant="ocean" size="lg" className="w-full" disabled={!isValid || busy} onClick={submit}>
        {busy ? "送出中…" : !token ? "驗證中…" : "📤 送出課程詢問"}
      </Button>
      <p className="text-[10px] text-center text-[var(--muted-foreground)]">
        送出後進客服信箱，老闆用 Email 回你（通常一天內）。
      </p>

      {/* 即時管道：LINE 直接問 */}
      <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="block">
        <Button size="lg" className="w-full" style={{ background: "#06C755", color: "#fff" }}>💬 急著問？用 LINE 直接問老闆</Button>
      </a>
    </div>
  );
}

// ── Cloudflare Turnstile（沿用 /contact 的實作）──
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
  return <div ref={ref} style={{ marginTop: 4 }} />;
}
