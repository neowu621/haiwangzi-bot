"use client";
// v401：連線診斷小工具 — 從「你的瀏覽器」實測到伺服器的延遲與 HTTP 協定。
//   側欄面板（variant="panel"）：按「測速」跑 6 次 healthz，顯示協定/最快(暖)/最慢(首次)/平均/抖動 + 一鍵複製。
//   頂部徽章（variant="badge"）：顯示最近一次平均延遲，點一下重測。
import { useState } from "react";

interface DiagResult {
  proto: string;
  avg: number;
  min: number;
  max: number;
  jitter: number;
  fails: number;
  ua: string;
}

async function measure(n = 6): Promise<DiagResult> {
  const samples: number[] = [];
  let proto = "?";
  let fails = 0;
  for (let i = 0; i < n; i++) {
    const url = `/api/healthz?ping=${Date.now()}_${i}`;
    const t0 = performance.now();
    try {
      const r = await fetch(url, { cache: "no-store" });
      await r.text();
      samples.push(performance.now() - t0);
    } catch {
      fails++;
    }
    try {
      const ents = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const ent = [...ents].reverse().find((e) => e.name.includes(url));
      if (ent?.nextHopProtocol) proto = ent.nextHopProtocol;
    } catch { /* ignore */ }
  }
  const valid = samples.length ? samples : [0];
  const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  const min = Math.round(Math.min(...valid));
  const max = Math.round(Math.max(...valid));
  return { proto, avg, min, max, jitter: max - min, fails, ua: navigator.userAgent };
}

function verdict(r: DiagResult): { text: string; color: string } {
  if (r.fails >= 3) return { text: "連線不穩（多次失敗）", color: "#dc2626" };
  if (r.min <= 200) return { text: "網路 OK（延遲低）→ 若仍慢，問題在客戶端", color: "#16a34a" };
  if (r.min <= 600) return { text: "延遲略高，可再觀察", color: "#d97706" };
  return { text: "延遲偏高 → 偏向網路/線路問題", color: "#dc2626" };
}

export function ConnDiag({ variant = "panel" }: { variant?: "panel" | "badge" }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DiagResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setCopied(false);
    try {
      setRes(await measure());
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!res) return;
    const v = verdict(res);
    const txt = `【連線測速】協定=${res.proto} 最快(暖)=${res.min}ms 最慢(首次)=${res.max}ms 平均=${res.avg}ms 抖動=${res.jitter}ms 失敗=${res.fails}\n判讀：${v.text}\nUA=${res.ua}`;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  if (variant === "badge") {
    return (
      <button
        type="button"
        onClick={run}
        title="點一下測速：實測你到伺服器的延遲"
        className="hidden items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex"
        style={{ background: "rgba(255,255,255,0.1)", color: "#cfe8ff" }}
      >
        🔬 {busy ? "測速中…" : res ? `${res.min}ms ${res.proto}` : "連線測速"}
      </button>
    );
  }

  const v = res ? verdict(res) : null;
  return (
    <div className="mt-2 rounded-xl px-3 py-2 text-[11px]" style={{ background: "rgba(255,255,255,0.07)", color: "#dbe7f5" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold" style={{ color: "var(--color-phosphor)" }}>🔬 連線測速</span>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
        >
          {busy ? "測速中…" : "測速"}
        </button>
      </div>
      {res ? (
        <>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
            <span>協定</span><span className="text-right font-bold">{res.proto}</span>
            <span>最快(暖)</span><span className="text-right font-bold">{res.min} ms</span>
            <span>最慢(首次)</span><span className="text-right">{res.max} ms</span>
            <span>平均 / 抖動</span><span className="text-right">{res.avg} / {res.jitter} ms</span>
            {res.fails > 0 && (<><span>失敗</span><span className="text-right text-rose-300">{res.fails} 次</span></>)}
          </div>
          {v && <div className="mt-1 rounded px-1.5 py-1 text-[10px] font-semibold" style={{ background: "rgba(0,0,0,0.2)", color: v.color }}>{v.text}</div>}
          <button type="button" onClick={copy} className="mt-1.5 w-full rounded-md py-1 text-[10px] font-semibold" style={{ background: "rgba(255,255,255,0.12)" }}>
            {copied ? "✓ 已複製" : "📋 複製結果給工程師"}
          </button>
        </>
      ) : (
        <div className="text-[10px] opacity-70">按「測速」實測你到伺服器的延遲與協定，截圖或複製給工程師判斷問題。</div>
      )}
    </div>
  );
}
