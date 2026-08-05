"use client";
// v1022：手機「快速新增日潛場次」——複製既有場次(範本) → 選多個日期 → 一次建立。
//   為「一次開 1~2 週」設計：快速鍵(本週六日/下週六日/未來兩週六日/連續7天/連續14天) + 月曆多選。
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";

interface Template {
  key: string;
  sourceTripId: string;
  startTime: string;
  siteNames: string[];
  tankCount: number;
  capacity: number | null;
  isNightDive: boolean;
  isBoat: boolean;
  isScooter: boolean;
  usedCount: number;
  lastUsed: string;
}
interface Resp { templates: Template[]; bookedDates: string[] }

const WD = ["日", "一", "二", "三", "四", "五", "六"];
const MAX_DAYS = 14;
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const todayStr = () => ymd(new Date());
/** 由今天起算，往後 n 天的日期字串 */
function addDays(base: string, n: number): string {
  const d = new Date(`${base}T00:00:00+08:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export default function MobileTripNewPage() {
  const { ready } = useAdminAuth();
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [picked, setPicked] = useState<Template | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  useEffect(() => {
    if (!ready) return;
    adminFetch<Resp>("/api/admin/m/trip-templates")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"));
  }, [ready]);

  const booked = useMemo(() => new Set(data?.bookedDates ?? []), [data]);

  function toggleDate(d: string) {
    setDates((prev) => {
      if (prev.includes(d)) return prev.filter((x) => x !== d);
      if (prev.length >= MAX_DAYS) { alert(`一次最多 ${MAX_DAYS} 天`); return prev; }
      return [...prev, d].sort();
    });
  }
  /** 快速選：往後找 n 個「週六日」 */
  function pickWeekends(weeks: number) {
    const t = todayStr();
    const out: string[] = [];
    for (let i = 0; i < weeks * 7 + 7 && out.length < weeks * 2; i++) {
      const ds = addDays(t, i);
      const wd = new Date(`${ds}T00:00:00+08:00`).getDay();
      if (wd === 6 || wd === 0) out.push(ds);
    }
    setDates(out.slice(0, MAX_DAYS));
  }
  function pickRun(n: number) {
    const t = todayStr();
    setDates(Array.from({ length: Math.min(n, MAX_DAYS) }, (_, i) => addDays(t, i)));
  }

  async function submit() {
    if (!picked || dates.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const r = await adminFetch<{ created: string[]; skipped: string[] }>("/api/admin/m/trips/quick-add", {
        method: "POST",
        body: JSON.stringify({ sourceTripId: picked.sourceTripId, dates }),
      });
      const msg = [`✓ 已建立 ${r.created.length} 場`, r.skipped.length ? `（${r.skipped.length} 天已有同時段場次，已跳過）` : ""].join("");
      alert(msg);
      router.push("/admin/m/trips");
    } catch (e) {
      alert("建立失敗：" + (e instanceof Error ? e.message : String(e)));
      setSubmitting(false);
    }
  }

  const title = step === 1 ? "新增場次" : step === 2 ? "選日期" : "確認建立";

  if (!ready || (!data && !error)) {
    return (
      <MobileAdminShell title="新增場次" back="/admin/m/trips">
        <div className="flex justify-center py-16"><DiverLoader label="讀取常用場次…" size={96} /></div>
      </MobileAdminShell>
    );
  }

  return (
    <MobileAdminShell title={title} back={step === 1 ? "/admin/m/trips" : undefined}>
      {error && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>
          {error}
        </div>
      )}

      {/* ── Step 1：挑範本 ── */}
      {step === 1 && data && (
        <div className="space-y-2">
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            選一個常開的場次當範本，潛點／時間／支數／價格／教練／集合地點<b>全部沿用</b>，只要再選日期。
          </p>
          {data.templates.length === 0 ? (
            <div className="rounded-xl border px-3 py-6 text-center text-xs" style={{ borderColor: "rgba(0,0,0,0.08)", color: "var(--muted-foreground)" }}>
              近 60 天沒有場次可當範本，請先在電腦版新增一場。
            </div>
          ) : (
            <>
              <div className="pt-1 text-[11px] font-bold tracking-wide text-[var(--muted-foreground)]">⭐ 最常開（近 60 天）</div>
              {data.templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setPicked(t); setStep(2); }}
                  className="flex w-full items-center gap-2.5 rounded-xl border-2 bg-white px-3 py-2.5 text-left"
                  style={{ borderColor: picked?.key === t.key ? "var(--color-phosphor)" : "var(--border)" }}
                >
                  <span className="font-mono text-[14px] font-extrabold">{t.startTime}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">
                      {t.siteNames.join("・") || "未設潛點"}
                      {t.isNightDive && <span className="ml-1 rounded-full bg-[#e7e3ff] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#4b3fa7]">夜潛</span>}
                      {t.isBoat && <span className="ml-1 rounded-full bg-[#e0f0ff] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#1c6ea8]">船潛</span>}
                    </span>
                    <span className="block text-[10.5px] text-[var(--muted-foreground)]">
                      {t.tankCount} 支/人・{t.isBoat ? "船潛" : "岸潛"}・{t.capacity ? `上限 ${t.capacity} 人` : "不限人數"}・用過 {t.usedCount} 次
                    </span>
                  </span>
                  <span className="text-[var(--muted-foreground)]">›</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Step 2：選日期 ── */}
      {step === 2 && picked && (
        <div className="space-y-3">
          {/* 已選範本 */}
          <div className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <span className="font-mono text-[14px] font-extrabold">{picked.startTime}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold">{picked.siteNames.join("・") || "未設潛點"}</span>
              <span className="block text-[10.5px] text-[var(--muted-foreground)]">
                {picked.tankCount} 支/人・{picked.isBoat ? "船潛" : "岸潛"}・{picked.capacity ? `上限 ${picked.capacity} 人` : "不限人數"}
              </span>
            </span>
            <button type="button" onClick={() => setStep(1)} className="text-[11px] font-bold text-[#0a8f86]">更換</button>
          </div>

          {/* 快速選 */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-[var(--muted-foreground)]">快速選</div>
            <div className="flex flex-wrap gap-1.5">
              <QB onClick={() => pickWeekends(1)}>本週六日</QB>
              <QB onClick={() => pickWeekends(2)}>未來兩週六日</QB>
              <QB onClick={() => pickRun(7)}>連續 7 天</QB>
              <QB onClick={() => pickRun(14)}>連續 14 天</QB>
              {dates.length > 0 && <QB onClick={() => setDates([])}>清除</QB>}
            </div>
          </div>

          {/* 月曆 */}
          <Calendar
            y={month.y} m={month.m}
            onPrev={() => setMonth((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }))}
            onNext={() => setMonth((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }))}
            selected={dates} booked={booked} onToggle={toggleDate}
          />

          <button
            type="button"
            disabled={dates.length === 0}
            onClick={() => setStep(3)}
            className="block w-full rounded-xl py-3 text-center text-[14.5px] font-extrabold disabled:opacity-40"
            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          >
            {dates.length > 0 ? `確認 ${dates.length} 天 →` : "請選日期"}
          </button>
        </div>
      )}

      {/* ── Step 3：確認建立 ── */}
      {step === 3 && picked && (
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            以下 {dates.length} 場都會用「<b>{picked.startTime} {picked.siteNames.join("・")}・{picked.tankCount} 支/人</b>」的設定建立：
          </p>
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            {dates.map((d) => {
              const dt = new Date(`${d}T00:00:00+08:00`);
              return (
                <div key={d} className="flex items-center gap-2 border-b px-3 py-2 text-[12.5px] last:border-b-0" style={{ borderColor: "#f0f3f7" }}>
                  <span className="font-mono font-extrabold">{dt.getMonth() + 1}/{dt.getDate()}</span>
                  <span>（週{WD[dt.getDay()]}）{picked.startTime} {picked.siteNames.join("・")}</span>
                  <span className="ml-auto text-[11.5px] text-[var(--muted-foreground)]">{picked.tankCount} 支</span>
                  {booked.has(d) && <span className="text-[10px] font-bold text-[var(--color-coral)]">已有場次</span>}
                </div>
              );
            })}
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
            狀態＝<b>開放</b>，建立後客戶即可預約。集合地點／地圖／參考影片／活動提醒都沿用範本。
            <br />同日期同時段已有場次會自動跳過。
          </p>
          <button
            type="button" onClick={submit} disabled={submitting}
            className="block w-full rounded-xl py-3 text-center text-[14.5px] font-extrabold disabled:opacity-50"
            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          >
            {submitting ? "建立中…" : `建立 ${dates.length} 場`}
          </button>
          <button
            type="button" onClick={() => setStep(2)}
            className="block w-full rounded-xl border py-2.5 text-center text-[13px] text-[var(--muted-foreground)]"
            style={{ borderColor: "var(--border)" }}
          >
            上一步
          </button>
        </div>
      )}
    </MobileAdminShell>
  );
}

function QB({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="rounded-lg border bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-[#33464e]"
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </button>
  );
}

function Calendar({ y, m, selected, booked, onToggle, onPrev, onNext }: {
  y: number; m: number; selected: string[]; booked: Set<string>;
  onToggle: (d: string) => void; onPrev: () => void; onNext: () => void;
}) {
  const today = todayStr();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // 週一起始
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];
  const sel = new Set(selected);
  return (
    <div className="rounded-xl border bg-white p-2.5" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-extrabold">
        <button type="button" onClick={onPrev} className="px-2 text-[var(--muted-foreground)]">‹</button>
        <span>{y} 年 {m + 1} 月</span>
        <button type="button" onClick={onNext} className="px-2 text-[var(--muted-foreground)]">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <div key={w} className="pb-1 text-[10px] text-[var(--muted-foreground)]">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const past = d < today;
          const on = sel.has(d);
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              onClick={() => onToggle(d)}
              className="relative rounded-lg py-1.5 text-[12.5px] disabled:opacity-30"
              style={{
                background: on ? "var(--color-ocean-deep)" : "transparent",
                color: on ? "#fff" : undefined,
                fontWeight: on || d === today ? 800 : 400,
                boxShadow: d === today && !on ? "inset 0 0 0 1.5px var(--color-phosphor)" : undefined,
              }}
            >
              {Number(d.slice(-2))}
              {booked.has(d) && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: "var(--color-coral)" }} />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2.5 text-[10px] text-[var(--muted-foreground)]">
        <span><i className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--color-coral)" }} />已有場次</span>
        <span>▢ 今天</span>
        <span>■ 已選（{selected.length} 天）</span>
      </div>
    </div>
  );
}
