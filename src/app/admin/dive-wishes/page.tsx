"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Wish {
  id: string;
  type: string;
  preferredDate: string;
  alternativeDates: string[];
  diveSiteIds: string[];
  otherSites: string | null;
  participants: number;
  budgetPerPerson: number | null;
  customerNote: string | null;
  status: string;
  lastActivityAt: string;
  createdAt: string;
  user: { displayName: string; realName: string | null; phone: string | null };
}

const TYPE_LABEL: Record<string, string> = {
  boat: "🚤 船潛",
  shore: "🏖 岸潛",
  night: "🌙 夜潛",
  tour: "✈️ 潛水團",
};
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "🟡 待回覆", cls: "bg-amber-100 text-amber-700" },
  discussing: { label: "💬 討論中", cls: "bg-blue-100 text-blue-700" },
  converted: { label: "🟢 場次已開", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "⚪ 已取消", cls: "bg-gray-100 text-gray-600" },
};

export default function AdminDiveWishesPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await adminFetch<{ wishes: Wish[]; counts: Array<{ status: string; _count: { _all: number } }> }>(
        `/api/admin/dive-wishes?status=${filter}`,
      );
      setWishes(r.wishes ?? []);
      const map: Record<string, number> = {};
      for (const c of r.counts ?? []) map[c.status] = c._count._all;
      setCounts(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  return (
    <AdminShell title="願望單管理">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          { k: "pending", label: "🟡 待回覆" },
          { k: "discussing", label: "💬 討論中" },
          { k: "converted", label: "🟢 已開場次" },
          { k: "cancelled", label: "⚪ 已取消" },
          { k: "all", label: "全部" },
        ].map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFilter(f.k)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              filter === f.k ? "bg-[var(--color-ocean-deep)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)]",
            )}
          >
            {f.label}
            {f.k !== "all" && counts[f.k] != null && ` (${counts[f.k]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</p>
      ) : wishes.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">沒有符合條件的願望單</p>
      ) : (
        <div className="space-y-3">
          {wishes.map((w) => {
            const meta = STATUS_LABEL[w.status] ?? { label: w.status, cls: "" };
            return (
              <Link key={w.id} href={`/admin/dive-wishes/${w.id}`}>
                <div className="rounded-xl border bg-white p-3 hover:bg-[var(--muted)]/30 cursor-pointer" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={meta.cls}>{meta.label}</Badge>
                      <span className="text-sm font-bold">{w.user.realName ?? w.user.displayName}</span>
                      {w.user.phone && <span className="text-[10px] text-[var(--muted-foreground)] tabular">{w.user.phone}</span>}
                      <span className="text-xs">{TYPE_LABEL[w.type] ?? w.type}</span>
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {new Date(w.lastActivityAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-xs space-y-0.5 text-[var(--muted-foreground)]">
                    <div>📅 {w.preferredDate.slice(0, 10)} {w.alternativeDates.length > 0 && `（備選 ${w.alternativeDates.map(d => d.slice(0, 10)).join(", ")}）`}</div>
                    <div>📍 {[...w.diveSiteIds, w.otherSites ?? ""].filter(Boolean).join("、")}</div>
                    <div>👥 ×{w.participants} 人 {w.budgetPerPerson && `· 💰 預算 NT$ ${w.budgetPerPerson.toLocaleString()}/人`}</div>
                    {w.customerNote && <div className="line-clamp-2">💬 {w.customerNote}</div>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center">
        <Button variant="outline" size="sm" onClick={() => void load()}>🔄 重新整理</Button>
      </div>
    </AdminShell>
  );
}
