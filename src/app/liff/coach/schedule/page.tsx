"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Anchor, Moon, Users } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  capacity: number;
  booked: number;
  available: number;
  sites: Array<{ id: string; name: string } | null>;
}

function fmtISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function CoachSchedulePage() {
  const liff = useLiff();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in14 = new Date(today.getTime() + 14 * 86400000);
    liff
      .fetchWithAuth<{ trips: Trip[] }>(
        `/api/trips?from=${fmtISO(today)}&to=${fmtISO(in14)}`,
      )
      .then((d) => setTrips(d.trips))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [liff]);

  // group by date
  const byDate = new Map<string, Trip[]>();
  for (const t of trips) {
    const arr = byDate.get(t.date) ?? [];
    arr.push(t);
    byDate.set(t.date, arr);
  }
  const dates = Array.from(byDate.keys()).sort();

  return (
    <LiffShell title="本期排班" backHref="/liff/welcome">
      <div className="space-y-3 px-4 pt-4">
        {loading && (
          <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}
        {!loading && dates.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            未來 14 天沒有排定的場次
          </Card>
        )}
        {dates.map((date) => {
          const list = byDate.get(date)!;
          const weekday = ["日", "一", "二", "三", "四", "五", "六"][
            new Date(date).getDay()
          ];
          return (
            <div key={date}>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                <Calendar className="h-3 w-3" />
                <span className="tabular">{date}</span>
                <span>週{weekday}</span>
                <span>· {list.length} 場</span>
              </div>
              <div className="space-y-2">
                {list.map((t) => (
                  <Link key={t.id} href={`/liff/dive/trip/${t.id}`}>
                    <Card
                      className={cn(
                        t.isNightDive
                          ? "border-l-4 border-l-[var(--color-ocean-deep)] bg-[var(--color-midnight)] text-white"
                          : "border-l-4 border-l-[var(--color-phosphor)]",
                      )}
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="text-lg font-bold tabular">
                          {t.startTime}
                        </div>
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-1 font-semibold">
                            <Anchor className="h-3 w-3 opacity-70" />
                            {t.sites
                              .filter((s) => s)
                              .map((s) => s!.name)
                              .join(" · ") || "東北角"}
                            {t.isNightDive && (
                              <Badge variant="ocean" className="ml-1 gap-0.5 text-[10px]">
                                <Moon className="h-2.5 w-2.5" />夜
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs tabular">
                          <Users className="h-3 w-3" />
                          {t.booked}/{t.capacity}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </LiffShell>
  );
}
