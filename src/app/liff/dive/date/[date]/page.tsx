"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Users, Anchor, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn, isBookingClosed } from "@/lib/utils";

interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number | null;     // null = 無上限
  booked: number;
  available: number | null;    // null = 無上限
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
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, liff.ready]);

  // v358：客戶端只顯示「可預約」場次；過期（開始前2hr已截止 / 過去日期）整筆隱藏。
  //   老闆/管理者看過期場次到「後台 → 日潛場次」。
  const visibleTrips = trips.filter((t) => !isBookingClosed(t.date, t.startTime));

  // 注意：不對整個 shell 套 midnight，
  //  否則白色卡片上的灰色字會被全域 text-white 覆寫導致對比不足。
  //  夜潛 trip 的卡片本身已套深色主題（line 73）。
  return (
    <LiffShell
      title={`${date} 場次`}
      backHref="/liff/calendar"
    >
      <section className="space-y-3 px-4 pt-4">
        {loading && <LiffLoading variant="skeleton" count={2} label="正在查詢這天的場次..." />}
        {!loading && visibleTrips.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            這天暫無可預約場次
          </Card>
        )}
        {visibleTrips.map((t) => {
          // v48：每人預估費（1 人 × 滿支數），baseTrip 是整單共享所以這只是 lower-bound
          // 公式：baseTrip + extraTank × tanks (此處 1 人) + 夜潛/水推
          // v155：夜潛加價已移除（夜潛與白天統一價）；水上摩托車欄位前已停用
          const base =
            t.pricing.baseTrip +
            t.pricing.extraTank * t.tankCount;
          // v341：開始前 2 小時截止
          const closed = isBookingClosed(t.date, t.startTime);
          const card = (
              <Card
                className={cn(
                  t.isNightDive ? "border-indigo-400 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white" : "",
                  closed && "opacity-50 grayscale",
                )}
              >
                <div className="flex items-start justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span className="text-xl font-bold tabular">
                        {t.startTime}
                      </span>
                      {t.isNightDive && (
                        <Badge className="gap-1 border-transparent bg-white text-indigo-700 font-bold">
                          <Moon className="h-3 w-3" /> 夜潛
                        </Badge>
                      )}
                      {t.isScooter && (
                        <Badge variant="gold">水推</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-sm font-semibold">
                      <Anchor className="h-4 w-4 opacity-70" />
                      {t.sites.filter((s) => s).map((s) => s!.name).join(" · ") || "—"}
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
                        {t.capacity == null ? `${t.booked} 人` : `${t.booked}/${t.capacity}`}
                      </span>
                    </div>
                    <Badge
                      variant={
                        closed || t.available === 0
                          ? "muted"
                          : t.available != null && t.available <= 2
                          ? "coral"
                          : "default"
                      }
                      className="mt-2 tabular whitespace-nowrap"
                    >
                      {closed
                        ? "無法預約"
                        : t.available === 0
                        ? "已滿"
                        : t.available != null && t.available <= 2
                        ? `剩 ${t.available}`
                        : "可預約"}
                    </Badge>
                  </div>
                </div>
              </Card>
          );
          return closed ? (
            <div key={t.id} className="cursor-not-allowed">{card}</div>
          ) : (
            <Link key={t.id} href={`/liff/dive/trip/${t.id}`}>{card}</Link>
          );
        })}
      </section>
    </LiffShell>
  );
}
