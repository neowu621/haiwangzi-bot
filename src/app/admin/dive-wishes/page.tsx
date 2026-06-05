"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog"; // v320

interface WishMessage {
  from: "customer" | "boss";
  text: string;
  at: string;
}

interface Wish {
  id: string;
  code: string | null;            // v328
  type: string;
  preferredDate: string;
  alternativeDates: string[];
  diveSiteIds: string[];
  otherSites: string | null;
  participants: number;
  budgetPerPerson: number | null;
  customerNote: string | null;
  messages: WishMessage[];        // v328
  status: string;
  lastActivityAt: string;
  createdAt: string;
  user: { lineUserId: string; displayName: string; realName: string | null; phone: string | null };
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
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null); // v320

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
              <DiveWishCard
                key={w.id}
                w={w}
                meta={meta}
                onOpenCustomer={() => setOpenCustomerId(w.user.lineUserId)}
              />
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center">
        <Button variant="outline" size="sm" onClick={() => void load()}>🔄 重新整理</Button>
      </div>

      {/* v320：全站統一客戶詳情 modal */}
      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />
    </AdminShell>
  );
}

// v328：願望單卡片 (Option D — LINE 訊息預覽風)
function DiveWishCard({
  w,
  meta,
  onOpenCustomer,
}: {
  w: Wish;
  meta: { label: string; cls: string };
  onOpenCustomer: () => void;
}) {
  const lastMsg = w.messages && w.messages.length > 0 ? w.messages[w.messages.length - 1] : null;
  const isWaitingBoss = lastMsg?.from === "customer" && (w.status === "pending" || w.status === "discussing");
  const sitesAll = [...w.diveSiteIds, w.otherSites ?? ""].filter(Boolean).join("、");

  function formatRelTime(at: string): string {
    const d = new Date(at);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "剛剛";
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} 小時前`;
    return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <Link href={`/admin/dive-wishes/${w.id}`}>
      <div
        className={cn(
          "rounded-xl border bg-white p-3.5 hover:bg-[var(--muted)]/30 cursor-pointer transition-colors",
          isWaitingBoss && "border-l-4 border-l-rose-500", // 🔴 客戶最後說話、輪老闆回
        )}
        style={{ borderColor: isWaitingBoss ? undefined : "var(--border)" }}
      >
        {/* Row 1: 狀態 + 待回覆紅點 + 編號 */}
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge className={meta.cls}>{meta.label}</Badge>
            {isWaitingBoss && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                待您回覆
              </span>
            )}
          </div>
          {w.code ? (
            <span className="inline-block rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-teal-800">
              {w.code}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)] font-mono">#{w.id.slice(0, 8)}</span>
          )}
        </div>

        {/* Row 2: 客戶 · 電話 */}
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenCustomer(); }}
            className="text-sm font-bold underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
          >
            👤 {w.user.realName ?? w.user.displayName}
          </button>
          {w.user.phone && (
            <span className="text-[11px] text-[var(--muted-foreground)] tabular">📞 {w.user.phone}</span>
          )}
        </div>

        {/* Row 3: 類型 · 潛點 · 日期 · 人數 · 預算（一行） */}
        <div className="text-xs text-[var(--muted-foreground)] mb-2">
          {TYPE_LABEL[w.type] ?? w.type} · 📍 {sitesAll || "—"} · 📅 {w.preferredDate.slice(0, 10)}
          {w.alternativeDates.length > 0 && `（備 ${w.alternativeDates.map(d => d.slice(5, 10)).join(",")}）`}
          {" "}· ×{w.participants} 人
          {w.budgetPerPerson != null && ` · 💰 NT$ ${w.budgetPerPerson.toLocaleString()}/人`}
        </div>

        {/* Row 4: 對話 preview（最後一則） */}
        <div className="border-t border-[var(--border)] pt-2 flex items-start gap-2">
          {lastMsg ? (
            <>
              <span className="text-[10px] flex-shrink-0 mt-0.5">
                {lastMsg.from === "boss" ? "💼" : "👤"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--muted-foreground)] mb-0.5">
                  {lastMsg.from === "boss" ? "老闆" : "客戶"}（{formatRelTime(lastMsg.at)}）
                </div>
                <div className="text-xs line-clamp-2 break-words">「{lastMsg.text}」</div>
              </div>
            </>
          ) : w.customerNote ? (
            <>
              <span className="text-[10px] flex-shrink-0 mt-0.5">💬</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--muted-foreground)] mb-0.5">客戶備註</div>
                <div className="text-xs line-clamp-2 break-words">{w.customerNote}</div>
              </div>
            </>
          ) : (
            <span className="text-[11px] text-[var(--muted-foreground)] italic">— 尚無對話</span>
          )}
        </div>

        {/* Row 5: 對話數 + footer time（右下） */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>💬 對話 {w.messages?.length ?? 0} 則</span>
          <span>{formatRelTime(w.lastActivityAt)}</span>
        </div>
      </div>
    </Link>
  );
}
