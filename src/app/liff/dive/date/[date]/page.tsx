"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Users, Anchor, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";

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
  pricing: { baseTrip: number; extraTank: number; nightDive: number; scooterRental: number };
}

export default function DiveDateListPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = use(params);
  const liff = useLiff();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    liff
      .fetchWithAuth<{ trips: Trip[] }>(`/api/trips?from=${date}&to=${date}`)
      .then((d) => setTrips(d.trips))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [date, liff]);

  // 注意：不對整個 shell 套 midnight，
  //  否則白色卡片上的灰色字會被全域 text-white 覆寫導致對比不足。
  //  夜潛 trip 的卡片本身已套深色主題（line 73）。
  return (
    <LiffShell
      title={`${date} 場次`}
      backHref="/liff/calendar"
    >
      <section className="space-y-3 px-4 pt-4">
        {loading && (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}
        {!loading && trips.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            這天暫無開放場次
          </Card>
        )}
        {trips.map((t) => {
          // v46 計價公式：extraTank × tankCount + baseTrip + 夜潛/水推
          const base =
            t.pricing.extraTank * t.tankCount +
            t.pricing.baseTrip +
            (t.isNightDive ? t.pricing.nightDive : 0) +
            (t.isScooter ? t.pricing.scooterRental : 0);
          return (
            <Link key={t.id} href={`/liff/dive/trip/${t.id}`}>
              <Card
                className={
                  t.isNightDive
                    ? "bg-[var(--color-midnight)] text-white"
                    : ""
                }
              >
                <div className="flex items-start justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span className="text-xl font-bold tabular">
                        {t.startTime}
                      </span>
                      {t.isNightDive && (
                        <Badge variant="ocean" className="gap-1">
                          <Moon className="h-3 w-3" /> 夜潛
                        </Badge>
                      )}
                      {t.isScooter && (
                        <Badge variant="gold">水推</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-sm font-semibold">
                      <Anchor className="h-4 w-4 opacity-70" />
                      {t.sites
                        .filter((s) => s)
                        .map((s) => s!.name)
                        .join(" · ") || "東北角"}
                    </div>
                    <div
                      className={
                        "mt-1 text-xs " +
                        (t.isNightDive ? "opacity-70" : "text-[var(--muted-foreground)]")
                      }
                    >
                      {t.tankCount} 支氣瓶 · 起 NT$ {base.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-xs">
                      <Users className="h-3 w-3" />
                      <span className="tabular">
                        {t.booked}/{t.capacity}
                      </span>
                    </div>
                    <Badge
                      variant={
                        t.available === 0
                          ? "muted"
                          : t.available <= 2
                          ? "coral"
                          : "default"
                      }
                      className="mt-2 tabular"
                    >
                      {t.available === 0
                        ? "已滿"
                        : t.available <= 2
                        ? `剩 ${t.available}`
                        : "可預約"}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </section>
    </LiffShell>
  );
}
