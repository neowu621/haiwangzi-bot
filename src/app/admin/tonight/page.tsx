"use client";
import * as React from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw, Sun, Moon } from "lucide-react";

/**
 * v273：老闆夜間結帳介面
 *
 * 列出「今日 + 昨日（如果還沒勾完）」場次的參加者，一鍵勾「到場」/「未到場」。
 * 用既有 /api/coach/bookings/[id]/attendance endpoint（status=completed → 觸發首單獎勵 + 推 LINE）。
 */
interface BookingRow {
  id: string;
  code: string | null;
  userId: string;
  participants: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  paymentStatus: string;
  user: { displayName: string; realName: string | null; phone: string | null };
  ref: { date?: string; startTime?: string; sites?: string[]; title?: string; dateStart?: string };
  signatureImageUrl?: string | null;
}

interface TripGroup {
  key: string; // trip id 或 tour id
  type: "daily" | "tour";
  label: string; // 「6/3 龍洞 08:00」or tour title
  date: string;
  bookings: BookingRow[];
}

export default function TonightPage() {
  const [bookings, setBookings] = React.useState<BookingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      // 撈今日 + 昨日 booking（status 仍 confirmed = 還沒勾過到場）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const from = yesterday.toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);

      const d = await adminFetch<{ bookings: BookingRow[] }>(
        `/api/admin/bookings?status=confirmed`,
      );
      // 客戶端過濾：日期在今/昨日 + 不是 completed
      const filtered = (d.bookings ?? []).filter((b) => {
        if (b.status !== "confirmed") return false;
        const refDate = b.ref?.date ?? b.ref?.dateStart;
        if (!refDate) return false;
        return refDate >= from && refDate <= to;
      });
      setBookings(filtered);
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // 依場次分組
  const groups: TripGroup[] = React.useMemo(() => {
    const m = new Map<string, TripGroup>();
    for (const b of bookings) {
      const date = b.ref?.date ?? b.ref?.dateStart ?? "?";
      const label = b.ref?.title
        ? b.ref.title
        : `${date} ${b.ref?.startTime ?? ""} ${b.ref?.sites?.join("/") ?? ""}`.trim();
      const key = `${date}|${label}`;
      if (!m.has(key)) {
        m.set(key, {
          key,
          type: b.ref?.title ? "tour" : "daily",
          label,
          date,
          bookings: [],
        });
      }
      m.get(key)!.bookings.push(b);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [bookings]);

  async function mark(b: BookingRow, action: "completed" | "no_show") {
    setActing(b.id);
    setMsg(null);
    try {
      await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      // 從 list 移除（已 mark 完）
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      setMsg(`✓ ${b.user.realName ?? b.user.displayName} → ${action === "completed" ? "到場" : "未到場"}`);
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Moon className="h-5 w-5" />
              今晚待確認 — 老闆結帳介面
            </h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              今日 + 昨日 confirmed 但還沒勾過到場的訂單。勾完到場 → 觸發 VIP 升等檢查 + 首單獎勵發放 + LINE 通知客戶。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "載入中..." : "重新整理"}
          </Button>
        </div>

        {msg && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>
            {msg}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">載入中...</p>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
            <Sun className="mx-auto h-10 w-10 text-[var(--muted-foreground)] mb-3" />
            <p className="text-base font-medium">沒有待確認的場次 🎉</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              所有今日 / 昨日的訂單都已勾過到場或未到場。
            </p>
            <Link href="/admin/bookings">
              <Button variant="outline" size="sm" className="mt-4">
                看完整訂單列表
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
                <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm font-bold">
                    {g.type === "daily" ? "🤿" : "✈️"} {g.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                    待勾選 {g.bookings.length} 筆
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {g.bookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{b.user.realName ?? b.user.displayName}</span>
                          <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px]">
                            {b.participants}人
                          </span>
                          {b.paymentStatus === "fully_paid" ? (
                            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">付清</span>
                          ) : (
                            <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">未付清</span>
                          )}
                          {b.signatureImageUrl && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700" title="有簽名">✍️</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] font-mono">
                          {b.code ?? b.id.slice(0, 8)} · {b.user.phone ?? "—"} · NT$ {b.paidAmount}/{b.totalAmount}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          disabled={acting === b.id}
                          onClick={() => mark(b, "completed")}
                          style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          到場
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === b.id}
                          onClick={() => mark(b, "no_show")}
                          style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          未到
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
          🌊 海王子潛水 · 老闆結帳介面
        </p>
      </div>
    </AdminShell>
  );
}
