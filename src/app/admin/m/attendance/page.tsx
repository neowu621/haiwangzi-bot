"use client";
// v678：手機版「到場點名」（/admin/m/attendance）—— 與桌機 /admin/attendance 區隔，手機不導去桌機介面。
//   走同一支 GET /api/admin/attendance/today；點名沿用 POST /api/coach/bookings/[id]/attendance。
import { useCallback, useEffect, useState } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Check, X, RefreshCw } from "lucide-react";

interface AttBooking {
  id: string;
  name: string;
  phone: string | null;
  participants: number;
  status: string;
  paymentStatus: string;
  signed: boolean;
}
interface Session {
  key: string;
  type: "daily" | "tour";
  label: string;
  time: string;
  date: string; // v737：場次日期 YYYY-MM-DD
  bookings: AttBooking[];
}

// v737：YYYY-MM-DD → 「2026-06-29（週一）」
function fmtDateW(d: string): string {
  if (!d) return "";
  const w = new Date(`${d}T00:00:00+08:00`).toLocaleDateString("zh-TW", { weekday: "short", timeZone: "Asia/Taipei" });
  return `${d}（${w}）`;
}

export default function MobileAttendancePage() {
  const { ready } = useAdminAuth();
  const [date, setDate] = useState("");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setMsg(null);
    adminFetch<{ date: string; sessions: Session[] }>("/api/admin/attendance/today")
      .then((d) => {
        if (!alive) return;
        setDate(d.date);
        setSessions(d.sessions ?? []);
      })
      .catch((e) => {
        if (alive) { setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e))); setSessions([]); }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ready]);

  useEffect(() => { const c = load(); return c; }, [load]);

  async function mark(b: AttBooking, action: "completed" | "no_show") {
    setActing(b.id);
    try {
      await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setSessions((prev) =>
        (prev ?? []).map((s) => ({
          ...s,
          bookings: s.bookings.map((x) => (x.id === b.id ? { ...x, status: action } : x)),
        })),
      );
      setMsg(`✓ ${b.name} → ${action === "completed" ? "到場" : "未到場"}`);
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  const totalPending = (sessions ?? []).reduce(
    (n, s) => n + s.bookings.filter((b) => b.status === "confirmed").length, 0,
  );

  return (
    <MobileAdminShell title="到場點名" back="/admin/m">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          今日（{date || "—"}）{totalPending > 0 ? `・還有 ${totalPending} 位待點` : ""}
        </p>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "載入中" : "重新整理"}
        </button>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(99,235,164,0.12)", color: "#047857" }}>
          {msg}
        </div>
      )}

      {loading && sessions === null ? (
        <p className="py-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>載入中...</p>
      ) : (sessions && sessions.length === 0) ? (
        <div className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          今天沒有要點名的場次 🎉
          <div className="mt-1 text-[11px] opacity-70">只顯示「今日、已確認」的場次與參加者</div>
        </div>
      ) : (
        <div className="space-y-3">
          {(sessions ?? []).map((s) => (
            <div key={s.key} className="rounded-xl border" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
              <div className="border-b px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <div className="text-[11px] font-semibold" style={{ color: "var(--color-ocean-deep)" }}>📅 {fmtDateW(s.date)}</div>
                <div className="text-sm font-bold">{s.type === "daily" ? "🔱" : "✈️"} {s.label}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {s.bookings.length} 筆・待點 {s.bookings.filter((b) => b.status === "confirmed").length}
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                {s.bookings.map((b) => {
                  const done = b.status === "completed";
                  const noShow = b.status === "no_show";
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium truncate">{b.name}</span>
                          <span className="flex-shrink-0 rounded bg-[var(--muted)] px-1 py-0.5 text-[10px]">{b.participants}人</span>
                          {b.paymentStatus === "fully_paid"
                            ? <span className="flex-shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">付清</span>
                            : <span className="flex-shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">未付清</span>}
                          {b.signed && <span className="flex-shrink-0 text-[11px]" title="有簽名">✍️</span>}
                        </div>
                        {b.phone && <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>📞 {b.phone}</div>}
                      </div>
                      {done ? (
                        <span className="flex-shrink-0 rounded-full bg-green-100 px-2.5 py-1.5 text-xs font-bold text-green-700">✅ 到場</span>
                      ) : noShow ? (
                        <button onClick={() => mark(b, "completed")} disabled={acting === b.id} className="flex-shrink-0 rounded-full bg-rose-100 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50">⚠ 未到·改到場</button>
                      ) : (
                        <div className="flex flex-shrink-0 gap-1.5">
                          <button onClick={() => mark(b, "completed")} disabled={acting === b.id} className="flex items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: "var(--color-ocean-deep)", color: "#fff" }}>
                            <Check className="h-3.5 w-3.5" />到場
                          </button>
                          <button onClick={() => mark(b, "no_show")} disabled={acting === b.id} className="flex items-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50" style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                            <X className="h-3.5 w-3.5" />未到
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </MobileAdminShell>
  );
}
