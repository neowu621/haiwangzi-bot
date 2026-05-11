"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number;
  booked: number;
  available: number;
  sites: Array<{ id: string; name: string } | null>;
}

type View = "2weeks" | "month";

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
  if (view === "2weeks") {
    const sun = startOfWeek(cursor);
    return Array.from({ length: 14 }, (_, i) => ({ date: addDays(sun, i) }));
  }
  // month
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

function rangeFromCells(cells: Array<{ date: Date | null }>) {
  const dates = cells.map((c) => c.date).filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

function headerLabel(view: View, cursor: Date, cells: Array<{ date: Date | null }>) {
  if (view === "month") {
    return `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(
      2,
      "0",
    )}`;
  }
  const r = rangeFromCells(cells);
  if (!r) return "";
  const a = `${r.from.getMonth() + 1}/${r.from.getDate()}`;
  const b = `${r.to.getMonth() + 1}/${r.to.getDate()}`;
  return `${a} – ${b}`;
}

export default function CalendarPage() {
  const liff = useLiff();
  const today = new Date();
  const [view, setView] = useState<View>("2weeks");
  const [cursor, setCursor] = useState<Date>(today);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const cells = useMemo(() => buildCells(view, cursor), [view, cursor]);
  const range = useMemo(() => rangeFromCells(cells), [cells]);

  useEffect(() => {
    if (!range) return;
    setLoading(true);
    liff
      .fetchWithAuth<{ trips: Trip[] }>(
        `/api/trips?from=${fmtISODate(range.from)}&to=${fmtISODate(range.to)}`,
      )
      .then((d) => setTrips(d.trips))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [range?.from.getTime(), range?.to.getTime(), liff]);

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
    if (view === "month") {
      setCursor(
        new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1),
      );
    } else {
      // 2weeks: 一次推 14 天
      setCursor(addDays(cursor, 14 * direction));
    }
  }

  const todayIso = fmtISODate(today);

  return (
    <LiffShell title="日潛行事曆" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <section className="px-4 pt-3">
        {/* 視圖切換 */}
        <div className="mb-2 inline-flex w-full rounded-full bg-[var(--muted)] p-1 text-xs">
          {(
            [
              ["2weeks", "近 2 週"],
              ["month", "本月"],
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
            const totalAvail = dayTrips.reduce((s, t) => s + t.available, 0);

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
          {view === "month" ? "本月場次預覽" : "此期場次預覽"}
        </h2>
        <div className="mt-2 space-y-2">
          {loading && (
            <div className="text-center text-sm text-[var(--muted-foreground)]">
              載入中...
            </div>
          )}
          {!loading && trips.length === 0 && (
            <div className="text-center text-sm text-[var(--muted-foreground)]">
              此期暫無場次
            </div>
          )}
          {trips.slice(0, view === "2weeks" ? 10 : 8).map((t) => {
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
                    {t.startTime} · 剩 {t.available}/{t.capacity}
                  </div>
                </div>
                <Badge
                  variant={t.available <= 2 ? "coral" : "muted"}
                  className="tabular"
                >
                  {t.available <= 2 ? "即將額滿" : "可預約"}
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
