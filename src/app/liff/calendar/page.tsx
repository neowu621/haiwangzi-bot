"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn, isBookingClosed } from "@/lib/utils";

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

// v369：客戶端固定顯示「今天 → 今天+10 天」滾動視窗（共 11 天）
const WINDOW_DAYS = 11;

function fmtISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// v369：今天起 N 天的格子；前面補空白格讓「今天」落在正確的星期欄
function buildWindowCells(today: Date, days: number): Array<{ date: Date | null }> {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const lead = start.getDay(); // 0=Sun → 今天之前同週的空格數
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null });
  for (let i = 0; i < days; i++) cells.push({ date: addDays(start, i) });
  return cells;
}

export default function CalendarPage() {
  useLiff(); // 確保 LIFF 初始化（資料走公開 API，不需 token）
  const today = useMemo(() => new Date(), []);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const cells = useMemo(() => buildWindowCells(today, WINDOW_DAYS), [today]);
  const winStart = useMemo(() => {
    const s = new Date(today); s.setHours(0, 0, 0, 0); return s;
  }, [today]);
  const winEnd = useMemo(() => addDays(winStart, WINDOW_DAYS - 1), [winStart]);

  useEffect(() => {
    setLoading(true);
    // v267：/api/trips 公開 endpoint，原生 fetch 立即發送，不必等 LIFF token
    fetch(`/api/trips?from=${fmtISODate(winStart)}&to=${fmtISODate(winEnd)}`)
      .then((r) => r.json())
      .then((d: { trips?: Trip[] }) => setTrips(d.trips ?? []))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [winStart, winEnd]);

  // v358/v369：客戶端只顯示「可預約」場次；過期（開始前2hr已截止 / 過去）整筆隱藏
  const openTrips = useMemo(
    () => trips.filter((t) => !isBookingClosed(t.date, t.startTime)),
    [trips],
  );

  const tripsByDate = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of openTrips) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [openTrips]);

  const todayIso = fmtISODate(today);
  const rangeLabel = `${winStart.getMonth() + 1}/${winStart.getDate()} – ${winEnd.getMonth() + 1}/${winEnd.getDate()}`;

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

        {/* v369：固定「今天起未來 10 天」標題 */}
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="text-base font-bold text-[var(--color-ocean-deep)]">未來 10 天場次</span>
          <span className="text-xs text-[var(--muted-foreground)] tabular">{rangeLabel}</span>
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
            const hasAM = dayTrips.some(
              (t) => !t.isNightDive && t.startTime < "14:00",
            );
            const hasPM = dayTrips.some(
              (t) => !t.isNightDive && t.startTime >= "14:00",
            );
            const hasNight = dayTrips.some((t) => t.isNightDive);
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
                  dayTrips.length
                    ? "hover:bg-[var(--muted)] active:scale-95"
                    : "pointer-events-none text-[var(--muted-foreground)] opacity-50",
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
          未來 10 天可預約場次
        </h2>
        <div className="mt-2 space-y-2">
          {loading && <LiffLoading variant="ring" label="正在查詢場次..." />}
          {!loading && openTrips.length === 0 && (
            <div className="text-center text-sm text-[var(--muted-foreground)]">
              未來 10 天暫無可預約場次
            </div>
          )}
          {/* v369：只列可預約（過期完全不顯示）；依日期排序 */}
          {openTrips.map((t) => {
            const wd = ["日", "一", "二", "三", "四", "五", "六"][
              new Date(t.date).getDay()
            ];
            const card = (
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
                      <Badge className="gap-0.5 text-[10px] border-transparent bg-indigo-500 text-white">
                        🌙 夜潛
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
                  className="tabular whitespace-nowrap"
                >
                  {t.available === 0
                    ? "已滿"
                    : t.available != null && t.available <= 2
                    ? "即將額滿"
                    : "可預約"}
                </Badge>
              </Card>
            );
            return (
              <Link key={t.id} href={`/liff/dive/trip/${t.id}`}>{card}</Link>
            );
          })}
        </div>
      </section>
    </LiffShell>
  );
}
