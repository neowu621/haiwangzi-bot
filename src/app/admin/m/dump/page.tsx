"use client";
// v1001：手機版後台「Dump 潛水資訊」—— 產生 LINE 筆記本 / FB 貼文，可編輯 + 一鍵複製。
//   文字邏輯與桌機共用 @/lib/dump-text。
import { useEffect, useMemo, useState } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { buildDumpText } from "@/lib/dump-text";
import { DiverLoader } from "@/components/ui/DiverLoader"; // v1021：載入動畫

interface Trip { date: string; startTime: string; diveSiteIds: string[]; tankCount: number; isNightDive?: boolean; status: string }
interface Tour { dateStart: string; dateEnd: string; title: string; durationLabel?: string | null; status: string }
interface Site { id: string; name: string }
interface DumpCfg { dumpPromoEnabled?: boolean; dumpPromoText?: string; dumpFooterEnabled?: boolean; dumpFooterText?: string; dumpFbHashtags?: string }

const DEFAULT_FB_TAGS = "#東北角潛水 #828魚群風暴潛水 #子彈流鶯歌石潛水 #海王子潛水團 #水肺潛水 #潛水預約 #潛旅";

export default function MobileDumpPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [cfg, setCfg] = useState<DumpCfg>({});
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"line" | "fb">("line");
  const [days, setDays] = useState(365);
  const [startDate] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));
  const [override, setOverride] = useState<string | null>(null); // 手動編輯後的內容
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      adminFetch<{ trips: Trip[] }>("/api/admin/trips"),
      adminFetch<Site[]>("/api/admin/sites"),
      adminFetch<{ tours: Tour[] }>("/api/admin/tours"),
      adminFetch<{ config: DumpCfg }>("/api/admin/site-config"),
    ])
      .then(([tr, si, to, co]) => {
        setTrips(tr.trips ?? []);
        setSites(si ?? []);
        setTours(to.tours ?? []);
        setCfg(co.config ?? {});
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const computed = useMemo(() => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://haiwangzi.xyz";
    return buildDumpText({
      mode, startDate, days, trips, tours, sites, baseUrl,
      promo: { enabled: cfg.dumpPromoEnabled ?? false, text: cfg.dumpPromoText ?? "" },
      footer: { enabled: cfg.dumpFooterEnabled ?? true, text: cfg.dumpFooterText ?? "" },
      fbTags: cfg.dumpFbHashtags ?? DEFAULT_FB_TAGS,
    });
  }, [mode, startDate, days, trips, tours, sites, cfg]);

  const shown = override ?? computed; // 沒手動改就跟著設定即時更新

  async function copy() {
    const t = shown;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  // v1021：資料還沒到齊 → 顯示潛水員動畫，避免先閃出「空的 Dump 內容」
  if (!loaded) {
    return (
      <MobileAdminShell title="Dump 潛水資訊" back="/liff/profile">
        <div className="flex justify-center py-16">
          <DiverLoader label="讀取場次與潛旅…" size={96} />
        </div>
      </MobileAdminShell>
    );
  }

  return (
    <MobileAdminShell title="Dump 潛水資訊" back="/liff/profile">
      <div className="space-y-3">
        <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed">
          產生「日潛場次＋潛旅」貼文，可直接編輯後一鍵複製，貼到 LINE 筆記本或 FB。預設今天起 365 天（全部）。
        </p>

        {/* 版型切換 */}
        <div className="flex gap-2">
          {(["line", "fb"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setOverride(null); }}
              className={`flex-1 rounded-lg border py-2 text-[13px] font-bold ${mode === m ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 text-[var(--color-ocean-deep)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              {m === "line" ? "💬 LINE 筆記本" : "📘 FB 貼文"}
            </button>
          ))}
        </div>

        {/* 天數 */}
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-[var(--muted-foreground)]">起始日</span>
          <span className="font-mono font-bold">{startDate}</span>
          <span className="ml-auto text-[var(--muted-foreground)]">天數</span>
          <input
            type="number" min={1} max={365} value={days}
            onChange={(e) => { setDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 365))); setOverride(null); }}
            className="w-16 rounded-md border border-[var(--border)] px-2 py-1 text-center text-[13px]"
          />
        </div>

        {/* 內容（可編輯） */}
        <textarea
          value={shown}
          onChange={(e) => setOverride(e.target.value)}
          rows={18}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent p-3 text-[12.5px] leading-relaxed font-mono outline-none focus:ring-2 focus:ring-[var(--color-phosphor)]/40"
        />

        <div className="flex items-center gap-2">
          {override !== null && (
            <button type="button" onClick={() => setOverride(null)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted-foreground)]">
              ↺ 還原
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className={`ml-auto rounded-lg px-5 py-2.5 text-[14px] font-bold text-white ${copied ? "bg-emerald-600" : "bg-[var(--color-ocean-deep)]"}`}
          >
            {copied ? "✓ 已複製" : "📋 一鍵複製"}
          </button>
        </div>
      </div>
    </MobileAdminShell>
  );
}
