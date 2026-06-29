"use client";
// v677：到場點名 —— 教練/助教（及老闆/管理者）現場點名今日參加名單。
//   GET /api/admin/attendance/today（依場次分組）；點名走既有 POST /api/coach/bookings/[id]/attendance。
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw, Sun } from "lucide-react";

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

export default function AttendancePage() {
  const [date, setDate] = useState("");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const d = await adminFetch<{ date: string; sessions: Session[] }>("/api/admin/attendance/today");
      setDate(d.date);
      setSessions(d.sessions ?? []);
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mark(b: AttBooking, action: "completed" | "no_show") {
    setActing(b.id);
    try {
      await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      // 即時更新該筆狀態
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
    <AdminShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">🐠 到場點名</h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              今日（{date || "—"}）參加名單。點「到場 / 未到」即時記錄。{totalPending > 0 ? ` 還有 ${totalPending} 位待點。` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "載入中..." : "重新整理"}
          </Button>
        </div>

        {msg && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>
            {msg}
          </div>
        )}

        {loading && sessions === null ? (
          <p className="text-sm text-[var(--muted-foreground)]">載入中...</p>
        ) : (sessions && sessions.length === 0) ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
            <Sun className="mx-auto h-10 w-10 text-[var(--muted-foreground)] mb-3" />
            <p className="text-base font-medium">今天沒有要點名的場次 🎉</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">只顯示「今日、已確認」的場次與參加者。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(sessions ?? []).map((s) => (
              <div key={s.key} className="rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[11px] font-semibold" style={{ color: "var(--color-ocean-deep)" }}>📅 {fmtDateW(s.date)}</p>
                  <p className="text-sm font-bold">{s.type === "daily" ? "🔱" : "✈️"} {s.label}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                    {s.bookings.length} 筆・待點 {s.bookings.filter((b) => b.status === "confirmed").length}
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {s.bookings.map((b) => {
                    const done = b.status === "completed";
                    const noShow = b.status === "no_show";
                    return (
                      <div key={b.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{b.name}</span>
                            <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px]">{b.participants}人</span>
                            {b.paymentStatus === "fully_paid" ? (
                              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">付清</span>
                            ) : (
                              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">未付清</span>
                            )}
                            {b.signed && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700" title="有簽名">✍️</span>}
                          </div>
                          {b.phone && <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] tabular-nums">📞 {b.phone}</div>}
                        </div>
                        {done ? (
                          <span className="flex-shrink-0 rounded-full bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">✅ 已到場</span>
                        ) : noShow ? (
                          <button onClick={() => mark(b, "completed")} disabled={acting === b.id} className="flex-shrink-0 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">⚠ 未到場（改為到場）</button>
                        ) : (
                          <div className="flex flex-shrink-0 gap-1.5">
                            <Button size="sm" disabled={acting === b.id} onClick={() => mark(b, "completed")} style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                              <Check className="mr-1 h-3.5 w-3.5" /> 到場
                            </Button>
                            <Button size="sm" variant="outline" disabled={acting === b.id} onClick={() => mark(b, "no_show")} style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                              <X className="mr-1 h-3.5 w-3.5" /> 未到
                            </Button>
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
      </div>
    </AdminShell>
  );
}
