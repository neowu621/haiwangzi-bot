"use client";
// 手機簡版後台「潛水旅行」（/admin/m/tours）—— 快速看「團況」用。
//   清單輕量載入 /api/admin/tours（只用清單欄位，不上來就抓每團報名）。
//   每張卡：團名・日期區間・狀態徽章・已報/可接受人數。預設「即將出發」優先(依出發日 asc)。
//   點卡展開 → 才按需抓該團報名名單（/api/admin/bookings?refId=<tourId>）：客戶姓名・人數・付款/訂單狀態。
//   編輯走桌機：卡內 / 頁首皆有「完整管理 →」深連結回 /admin/tours。
import { useEffect, useMemo, useState } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import { ChevronDown, ChevronRight, Users, Calendar } from "lucide-react";
import { deriveBookingDisplay } from "@/lib/booking-status"; // v674：roster 中文狀態

const TOURS_URL = "/api/admin/tours";

// 清單回傳 — 只取本頁會用到的欄位（其餘忽略）
interface Tour {
  id: string;
  title: string;
  subtitle?: string | null;
  dateStart: string;
  dateEnd: string;
  durationLabel?: string | null;
  capacity: number | null;
  status: string;
  booked?: number; // v194：累計報名人數（API 已 aggregate）
}
interface ToursResp {
  tours: Tour[];
}

// 該團報名名單（按需抓）
interface RosterRow {
  id: string;
  name: string;
  participants: number;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
}
interface BookingsResp {
  bookings: Array<{
    id: string;
    participants: number;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    paidAmount: number;
    createdAt: string;
    user: { displayName: string; realName: string | null };
  }>;
}

// 對齊 DB TourStatus：open / full / completed / cancelled
const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  open: { label: "開放中", bg: "rgba(0,217,203,0.15)", color: "var(--color-ocean-deep)" },
  full: { label: "已額滿", bg: "rgba(201,136,0,0.15)", color: "#9a6a00" },
  completed: { label: "已完成", bg: "rgba(0,0,0,0.06)", color: "var(--muted-foreground)" },
  cancelled: { label: "已取消", bg: "rgba(255,107,107,0.14)", color: "var(--color-coral)" },
};

// 狀態 chip 篩選
const CHIPS: Array<{ key: "all" | "upcoming" | "ended"; label: string }> = [
  { key: "upcoming", label: "即將出發" },
  { key: "all", label: "全部" },
  { key: "ended", label: "已結束" },
];

const todayStr = new Date().toISOString().slice(0, 10);
const fmtMD = (iso: string) => {
  const p = iso.slice(0, 10).split("-");
  return `${p[1]}/${p[2]}`;
};

export default function MobileToursPage() {
  const { ready } = useAdminAuth();
  const [tours, setTours] = useState<Tour[] | undefined>(
    () => getCached<ToursResp>(TOURS_URL)?.tours,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<"all" | "upcoming" | "ended">("upcoming");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // 每團報名名單（按需）：loading / error / RosterRow[]
  const [rosters, setRosters] = useState<Record<string, RosterRow[] | "loading" | "error">>({});

  // 載入清單（輕量；SWR：先吃快取再背景刷新）
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(tours === undefined);
    setError(null);
    cachedFetch<ToursResp>(TOURS_URL, { force: true })
      .then((d) => {
        if (!alive) return;
        setTours(d.tours);
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

  // 出發日 asc；已取消沉底。即將出發 = 結束日 >= 今天且未取消/未完成；已結束 = 反之。
  const visible = useMemo(() => {
    const list = (tours ?? [])
      .slice()
      .sort((a, b) => {
        const ac = a.status === "cancelled" ? 1 : 0;
        const bc = b.status === "cancelled" ? 1 : 0;
        if (ac !== bc) return ac - bc;
        return a.dateStart.slice(0, 10) < b.dateStart.slice(0, 10) ? -1 : 1;
      });
    if (chip === "all") return list;
    const ended = (t: Tour) =>
      t.status === "completed" || t.status === "cancelled" || t.dateEnd.slice(0, 10) < todayStr;
    return list.filter((t) => (chip === "ended" ? ended(t) : !ended(t)));
  }, [tours, chip]);

  async function toggle(tourId: string) {
    const next = new Set(open);
    if (next.has(tourId)) {
      next.delete(tourId);
      setOpen(next);
      return;
    }
    next.add(tourId);
    setOpen(next);
    // 已成功載過就不重抓
    const cur = rosters[tourId];
    if (Array.isArray(cur)) return;
    setRosters((m) => ({ ...m, [tourId]: "loading" }));
    try {
      // v674：light=1 跳過簽名 presigned URL 等 → 名單載入快很多
      const r = await adminFetch<BookingsResp>(`/api/admin/bookings?refId=${tourId}&light=1`);
      const rows: RosterRow[] = r.bookings.map((b) => ({
        id: b.id,
        name: b.user.realName ?? b.user.displayName,
        participants: b.participants,
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        createdAt: b.createdAt,
      }));
      setRosters((m) => ({ ...m, [tourId]: rows }));
    } catch {
      setRosters((m) => ({ ...m, [tourId]: "error" }));
    }
  }

  return (
    <MobileAdminShell title="潛水旅行" back="/admin/m">
      {/* 狀態 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => {
          const active = chip === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: active ? "var(--color-ocean-deep)" : "rgba(0,0,0,0.05)",
                color: active ? "#fff" : "var(--foreground)",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {loading && !tours && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}

      {tours && visible.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有符合的潛旅
        </div>
      )}

      {/* 卡片列表 */}
      <div className="space-y-2">
        {visible.map((t) => {
          const isOpen = open.has(t.id);
          const roster = rosters[t.id];
          const meta = STATUS_META[t.status] ?? {
            label: t.status,
            bg: "rgba(0,0,0,0.06)",
            color: "var(--muted-foreground)",
          };
          const booked = t.booked ?? 0;
          const cap = t.capacity;
          const sameDay = t.dateStart.slice(0, 10) === t.dateEnd.slice(0, 10);
          return (
            <div
              key={t.id}
              className="rounded-xl border"
              style={{
                borderColor: "rgba(0,0,0,0.08)",
                background: "var(--card, #fff)",
                opacity: t.status === "cancelled" ? 0.6 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{t.title}</span>
                    <span
                      className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div
                    className="mt-1 flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Calendar className="h-3 w-3" />
                      <span className="font-mono tabular-nums">
                        {sameDay ? fmtMD(t.dateStart) : `${fmtMD(t.dateStart)}–${fmtMD(t.dateEnd)}`}
                      </span>
                    </span>
                    {t.durationLabel && <span>{t.durationLabel}</span>}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <span className="inline-flex items-baseline gap-0.5 text-sm font-bold">
                    <Users
                      className="h-3.5 w-3.5 self-center"
                      style={{ color: "var(--color-ocean-deep)" }}
                    />
                    <span className="font-mono tabular-nums" style={{ color: "var(--color-ocean-deep)" }}>
                      {booked}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                      /{cap ?? "∞"} 人
                    </span>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                  ) : (
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-3 py-2.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  {roster === "loading" && (
                    <div className="py-2 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      載入名單中...
                    </div>
                  )}
                  {roster === "error" && (
                    <div className="py-2 text-center text-[11px]" style={{ color: "var(--color-coral)" }}>
                      名單載入失敗
                    </div>
                  )}
                  {Array.isArray(roster) && roster.length === 0 && (
                    <div className="py-2 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      尚無人報名
                    </div>
                  )}
                  {Array.isArray(roster) && roster.length > 0 && (
                    <div className="space-y-1.5">
                      {roster.map((b) => {
                        const unpaid = b.totalAmount - b.paidAmount;
                        return (
                          <div key={b.id} className="flex flex-col gap-0.5 border-b border-black/5 pb-1.5 text-[12px] last:border-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                              <span className="flex-shrink-0 font-mono tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                                ×{b.participants}
                              </span>
                              {/* v674：英文 → 中文合成狀態 */}
                              <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-ocean-deep)" }}>
                                {deriveBookingDisplay({ status: b.status, paymentStatus: b.paymentStatus, createdAt: b.createdAt }).label}
                              </span>
                            </div>
                            {/* v674：付款資訊 */}
                            <div className="text-[10px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                              已付 {b.paidAmount.toLocaleString()}
                              {unpaid > 0 ? <span style={{ color: "var(--color-coral)" }}>・未付 {unpaid.toLocaleString()}</span> : "・已收齊"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </MobileAdminShell>
  );
}
