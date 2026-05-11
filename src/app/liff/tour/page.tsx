"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plane, Calendar as CalIcon, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";

interface TourSummary {
  id: string;
  title: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  basePrice: number;
  deposit: number;
  capacity: number;
  booked: number;
  available: number;
  status: string;
}

const DEST_LABEL: Record<string, string> = {
  northeast: "東北角",
  green_island: "綠島",
  "green-island": "綠島",
  lanyu: "蘭嶼",
  kenting: "墾丁",
  other: "其他",
};

export default function TourListPage() {
  const liff = useLiff();
  const [tours, setTours] = useState<TourSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    liff
      .fetchWithAuth<{ tours: TourSummary[] }>("/api/tours")
      .then((d) => setTours(d.tours))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, [liff]);

  return (
    <LiffShell title="旅遊潛水" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <div className="space-y-3 px-4 pt-4">
        {loading && (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}
        {!loading && tours.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            目前無開放團次
          </Card>
        )}
        {tours.map((t) => {
          const days =
            Math.round(
              (+new Date(t.dateEnd) - +new Date(t.dateStart)) / 86400000,
            ) + 1;
          return (
            <Link key={t.id} href={`/liff/tour/${t.id}`}>
              <Card className="overflow-hidden">
                <div className="flex h-32 items-center justify-center bg-gradient-to-br from-[var(--color-ocean-deep)] to-[var(--color-ocean-surface)] text-white">
                  <Plane className="h-12 w-12 opacity-50" />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="ocean">{DEST_LABEL[t.destination] ?? t.destination}</Badge>
                    <Badge
                      variant={
                        t.available === 0
                          ? "muted"
                          : t.available <= 2
                          ? "coral"
                          : "default"
                      }
                      className="tabular"
                    >
                      {t.available === 0 ? "已滿" : `剩 ${t.available}/${t.capacity}`}
                    </Badge>
                  </div>
                  <h3 className="mt-2 text-lg font-bold leading-tight">
                    {t.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1">
                      <CalIcon className="h-3.5 w-3.5" />
                      <span className="tabular">{t.dateStart} → {t.dateEnd}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span className="tabular">{days}天</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <span className="text-xs text-[var(--muted-foreground)]">起</span>
                      <div className="text-2xl font-bold tabular text-[var(--color-coral)]">
                        NT$ {t.basePrice.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-xs text-[var(--muted-foreground)]">
                      訂金 <span className="tabular font-bold text-[var(--foreground)]">{t.deposit.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </LiffShell>
  );
}
