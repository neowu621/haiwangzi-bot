"use client";
// 手機簡版後台「今明場次」（/admin/m/trips）
//   只載今明兩天日潛場次（輕量 /api/admin/m/trips），依今天/明天分組。
//   每場一列：時間・潛點・X 人・教練；點列展開客戶姓名清單（預設收合）。
//   複雜編輯引導回 /admin/trips。
import { useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import { ChevronDown, ChevronRight, Users, MapPin, ExternalLink } from "lucide-react";

const URL = "/api/admin/m/trips";

interface MTrip {
  id: string;
  date: string;
  startTime: string;
  sites: string[];
  people: number;
  coachName: string | null;
  participants: string[];
}
interface Resp {
  today: string;
  tomorrow: string;
  trips: MTrip[];
}

export default function MobileTripsPage() {
  const { ready } = useAdminAuth();
  const [data, setData] = useState<Resp | undefined>(() => getCached<Resp>(URL));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(data === undefined);
    cachedFetch<Resp>(URL, { force: true })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const groups: Array<{ label: string; key: string; trips: MTrip[] }> = data
    ? [
        { label: "今天", key: data.today, trips: data.trips.filter((t) => t.date === data.today) },
        { label: "明天", key: data.tomorrow, trips: data.trips.filter((t) => t.date === data.tomorrow) },
      ]
    : [];

  return (
    <MobileAdminShell>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-bold">📅 今明場次</h1>
        <Link
          href="/admin/trips"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          編輯場次 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {loading && !data && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-sm font-bold">{g.label}</span>
                <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {g.key}・{g.trips.length} 場
                </span>
              </div>
              {g.trips.length === 0 ? (
                <div
                  className="rounded-xl border px-3 py-4 text-center text-xs"
                  style={{ borderColor: "rgba(0,0,0,0.08)", color: "var(--muted-foreground)" }}
                >
                  無場次
                </div>
              ) : (
                <div className="space-y-2">
                  {g.trips.map((t) => {
                    const isOpen = open.has(t.id);
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border"
                        style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(t.id)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                        >
                          <span className="font-mono text-sm font-bold tabular-nums">{t.startTime}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--color-ocean-deep)" }} />
                              <span className="truncate">{t.sites.join("、") || "—"}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                              <span className="inline-flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                {t.people} 人
                              </span>
                              {t.coachName && <span>教練：{t.coachName}</span>}
                            </div>
                          </div>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                          ) : (
                            <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                          )}
                        </button>
                        {isOpen && (
                          <div
                            className="border-t px-3 py-2"
                            style={{ borderColor: "rgba(0,0,0,0.06)" }}
                          >
                            {t.participants.length === 0 ? (
                              <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                                尚無報名
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {t.participants.map((name, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full px-2 py-0.5 text-[11px]"
                                    style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </MobileAdminShell>
  );
}
