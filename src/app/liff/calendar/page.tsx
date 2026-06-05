"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

// capacity / available 可能為 null（場次無上限時）
interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number | null;    // null = 無上限
  booked: number;
  available: number | null;   // null = 無上限
  sites: Array<{ id: string; name: string } | null>;
}

type View = "1week" | "2weeks";

function fmtISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 該日所在週的週日 00:00 */
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // 0=Sun
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function buildCells(view: View, cursor: Date): Array<{ date: Date | null }> {
  const sun = startOfWeek(cursor);
  const days = view === "1week" ? 7 : 14;
  return Array.from({ length: days }, (_, i) => ({ date: addDays(sun, i) }));
}

function rangeFromCells(cells: Array<{ date: Date | null }>) {
  const dates = cells.map((c) => c.date).filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

function headerLabel(_view: View, _cursor: Date, cells: Array<{ date: Date | null }>) {
  const r = rangeFromCells(cells);
  if (!r) return "";
  const a = `${r.from.getMonth() + 1}/${r.from.getDate()}`;
  const b = `${r.to.getMonth() + 1}/${r.to.getDate()}`;
  return `${a} – ${b}`;
}

export default function CalendarPage() {
  const liff = useLiff();
  const today = new Date();
  const [view, setView] = useState<View>("1week"); // v330：預設本週
  const [cursor, setCursor] = useState<Date>(today);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const cells = useMemo(() => buildCells(view, cursor), [view, cursor]);
  const range = useMemo(() => rangeFromCells(cells), [cells]);

  useEffect(() => {
    if (!range) return;
    setLoading(true);
    // v267：/api/trips 是公開 endpoint，不需要 LIFF auth → 用原生 fetch 立即發送，
    //   不必等 LIFF init 完成（省 1-1.5 秒）。原本走 liff.fetchWithAuth 會等 token，
    //   但 token 對這支 API 來說根本沒用。
    fetch(`/api/trips?from=${fmtISODate(range.from)}&to=${fmtISODate(range.to)}`)
      .then((r) => r.json())
      .then((d: { trips?: Trip[] }) => setTrips(d.trips ?? []))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [range?.from?.getTime(), range?.to?.getTime()]);

  const tripsByDate = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of trips) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [trips]);

  function shiftCursor(direction: 1 | -1) {
    // v330: 1week 一次推 7 天、2weeks 一次推 14 天
    const days = view === "1week" ? 7 : 14;
    setCursor(addDays(cursor, days * direction));
  }

  const todayIso = fmtISODate(today);

  return (
    <LiffShell title="一日潛水" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <section className="px-4 pt-3">
        {/* v330：找不到日期 → 引導至願望單 */}
        <Link href="/liff/wishes/new" className="mb-3 block">
          <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 p-3 hover:bg-[var(--color-phosphor)]/10 transition-colors">
            <span className="text-xl">📝</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--color-ocean-deep)]">找不到日期？</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">可提預約潛水日期（老闆會回覆討論）</div>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--color-phosphor)]" />
          </div>
        </Link>

        {/* 視圖切換 */}
        <div className="mb-2 inline-flex w-full rounded-full bg-[var(--muted)] p-1 text-xs">
          {(
            [
              ["1week", "本週"],
              ["2weeks", "近兩週"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setCursor(today);
              }}
              className={cn(
                "flex-1 rounded-full py-1.5 font-semibold transition-colors",
                view === v
                  ? "bg-white text-[var(--color-ocean-deep)] shadow"
                  : "text-[var(--muted-foreground)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 月份/週次切換 */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => shiftCursor(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-base font-bold tabular">
            {headerLabel(view, cursor, cells)}
          </div>
          <Button variant="ghost" size="icon" onClick={() => shiftCursor(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* 星期表頭 */}
        <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--muted-foreground)]">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* 日期格 */}
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c.date) return <div key={i} className="aspect-square" />;
            const iso = fmtISODate(c.date);
            const dayTrips = tripsByDate.get(iso) ?? [];
            const isToday = iso === todayIso;
            const isPast = c.date < new Date(new Date().setHours(0, 0, 0, 0));
            const hasAM = dayTrips.some(
              (t) => !t.isNightDive && t.startTime < "14:00",
            );
            const hasPM = dayTrips.some(
              (t) => !t.isNightDive && t.startTime >= "14:00",
            );
            const hasNight = dayTrips.some((t) => t.isNightDive);
            // available 為 null（無上限）視為 ∞，這裡用 0 累加避免 NaN
            const totalAvail = dayTrips.reduce((s, t) => s + (t.available ?? 0), 0);

            return (
              <Link
                key={i}
                href={dayTrips.length ? `/liff/dive/date/${iso}` : "#"}
                aria-disabled={!dayTrips.length}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm",
                  isToday
                    ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 font-bold"
                    : "border-[var(--border)]",
                  isPast && "text-[var(--muted-foreground)] opacity-50",
                  dayTrips.length
                    ? "hover:bg-[var(--muted)] active:scale-95"
                    : "pointer-events-none",
                )}
              >
                <span className="tabular">{c.date.getDate()}</span>
                <div className="absolute bottom-1 flex gap-0.5">
                  {hasAM && (
                    <span className="block h-1 w-1.5 rounded-full bg-[var(--color-gold)]" />
                  )}
                  {hasPM && (
                    <span className="block h-1 w-1.5 rounded-full bg-[var(--color-phosphor)]" />
                  )}
                  {hasNight && (
                    <span className="block h-1 w-1 rounded-full bg-[var(--color-ocean-deep)]" />
                  )}
                </div>
                {totalAvail > 0 && totalAvail <= 2 && (
                  <span className="absolute right-0.5 top-0.5 text-[9px] font-bold text-[var(--color-coral)]">
                    {totalAvail}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gold)]" /> 上午
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-phosphor)]" /> 下午
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ocean-deep)]" /> 夜潛
          </span>
        </div>
      </section>

      <section className="mt-4 px-4">
        <h2 className="text-sm font-semibold text-[var(--muted-foreground)]">
          {view === "1week" ? "本週場次預覽" : "近兩週場次預覽"}
        </h2>
        <div className="mt-2 space-y-2">
          {loading && <LiffLoading variant="ring" label="正在查詢場次..." />}
          {!loading && trips.length === 0 && (
            <div className="text-center text-sm text-[var(--muted-foreground)]">
              此期暫無場次
            </div>
          )}
          {trips.slice(0, view === "2weeks" ? 10 : 7).map((t) => {
            const wd = ["日", "一", "二", "三", "四", "五", "六"][
              new Date(t.date).getDay()
            ];
            return (
            <Link key={t.id} href={`/liff/dive/trip/${t.id}`}>
              <Card className="flex items-center gap-3 p-3">
                <div className="flex w-14 flex-col items-center leading-tight">
                  <div className="text-lg font-bold tabular">
                    {t.date.slice(8)}
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--color-ocean-deep)]">
                    週 {wd}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    {t.date.slice(5, 7)} 月
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                    <span>
                      {t.sites
                        .filter((s) => s)
                        .map((s) => s!.name)
                        .join(" · ") || "東北角"}
                    </span>
                    <Badge variant="muted" className="text-[10px]">
                      {t.tankCount} 潛
                    </Badge>
                    {t.isNightDive && (
                      <Badge variant="ocean" className="text-[10px]">
                        夜潛
                      </Badge>
                    )}
                    {t.isScooter && (
                      <Badge variant="gold" className="text-[10px]">
                        水推
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] tabular">
                    {t.startTime} ·{" "}
                    {t.capacity == null
                      ? `已報 ${t.booked} 人`
                      : t.available === 0
                      ? "已滿"
                      : `剩 ${t.available}/${t.capacity}`}
                  </div>
                </div>
                <Badge
                  variant={t.available != null && t.available <= 2 ? "coral" : "muted"}
                  className="tabular"
                >
                  {t.available === 0
                    ? "已滿"
                    : t.available != null && t.available <= 2
                    ? "即將額滿"
                    : "可預約"}
                </Badge>
              </Card>
            </Link>
            );
          })}
        </div>
      </section>
    </LiffShell>
  );
}
