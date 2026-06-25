"use client";
// 手機簡版後台「願望單」（/admin/m/dive-wishes）
//   狀態 chips（待回覆/討論中/已開場次/已取消/全部，預設待回覆）+ 願望單卡片列表。
//   走桌機同支 /api/admin/dive-wishes?status=xxx（回 wishes + counts），take 200，前端再 cap 50 顯示。
//   卡片本體導去 /admin/dive-wishes/[id] 看完整對話；待回覆/討論中可直接「回覆」(PATCH，LINE 通知)。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { MessageSquareReply, Send, X } from "lucide-react";

interface WishMessage {
  from: "customer" | "boss";
  text: string;
  at: string;
}
interface Wish {
  id: string;
  code: string | null;
  type: string;
  preferredDate: string;
  alternativeDates: string[];
  diveSiteIds: string[];
  otherSites: string | null;
  participants: number;
  budgetPerPerson: number | null;
  customerNote: string | null;
  messages: WishMessage[];
  status: string;
  lastActivityAt: string;
  createdAt: string;
  user: { lineUserId: string; displayName: string; realName: string | null; phone: string | null };
}
interface Resp {
  wishes: Wish[];
  counts: Array<{ status: string; _count: { _all: number } }>;
}

const MAX_SHOW = 50; // 手機端只顯示前 N 筆（後端 take 200），避免一次塞太多

const TYPE_LABEL: Record<string, string> = {
  boat: "船潛",
  shore: "岸潛",
  night: "夜潛",
  tour: "潛水團",
};

// 對齊 DB / 桌機版 status enum：pending / discussing / converted / cancelled
const STATUS_CHIPS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "待回覆" },
  { key: "discussing", label: "討論中" },
  { key: "converted", label: "已開場次" },
  { key: "cancelled", label: "已取消" },
  { key: "all", label: "全部" },
];
const STATUS_LABEL: Record<string, string> = {
  pending: "待回覆",
  discussing: "討論中",
  converted: "已開場次",
  cancelled: "已取消",
};

function formatRelTime(at: string): string {
  const d = new Date(at);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} 小時前`;
  return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MobileDiveWishesPage() {
  const { ready } = useAdminAuth();
  const [status, setStatus] = useState("pending"); // 預設待回覆（可行動的那批）
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 回覆中的願望單（null = 沒展開）
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    adminFetch<Resp>(`/api/admin/dive-wishes?status=${status}`)
      .then((d) => {
        if (!alive) return;
        setWishes((d.wishes ?? []).slice(0, MAX_SHOW));
        const map: Record<string, number> = {};
        for (const c of d.counts ?? []) map[c.status] = c._count._all;
        setCounts(map);
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
  }, [ready, status]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  function openReply(id: string) {
    setReplyOpen(id);
    setReplyText("");
    setReplyErr(null);
  }
  function closeReply() {
    setReplyOpen(null);
    setReplyText("");
    setReplyErr(null);
  }

  async function submitReply(id: string) {
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true);
    setReplyErr(null);
    try {
      // PATCH /api/admin/dive-wishes/[id] → { text, channels }（預設 line 通知客戶）
      await adminFetch(`/api/admin/dive-wishes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ text, channels: ["line"] }),
      });
      closeReply();
      load(); // 重抓（狀態會變成 discussing）
    } catch (e) {
      setReplyErr(e instanceof Error ? e.message : "回覆失敗");
    } finally {
      setReplying(false);
    }
  }

  return (
    <MobileAdminShell title="願望單" back="/admin/m">
      {/* 狀態 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((c) => {
          const active = status === c.key;
          const n = c.key !== "all" ? counts[c.key] : undefined;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatus(c.key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: active ? "var(--color-ocean-deep)" : "rgba(0,0,0,0.05)",
                color: active ? "#fff" : "var(--foreground)",
              }}
            >
              {c.label}
              {n != null ? ` (${n})` : ""}
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

      {/* 列表 */}
      <div className="space-y-2">
        {wishes.map((w) => {
          const lastMsg = w.messages && w.messages.length > 0 ? w.messages[w.messages.length - 1] : null;
          const isWaitingBoss =
            lastMsg?.from === "customer" && (w.status === "pending" || w.status === "discussing");
          const canReply = w.status === "pending" || w.status === "discussing";
          const sitesAll = [...w.diveSiteIds, w.otherSites ?? ""].filter(Boolean).join("、");
          const name = w.user.realName ?? w.user.displayName;

          return (
            <div
              key={w.id}
              className="rounded-xl border px-3 py-2.5"
              style={{
                borderColor: isWaitingBoss ? "var(--color-coral)" : "rgba(0,0,0,0.08)",
                background: "var(--card, #fff)",
              }}
            >
              <Link href={`/admin/dive-wishes/${w.id}`} className="block active:scale-[0.99]">
                {/* 客戶 + 狀態 */}
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{name}</span>
                  <span
                    className="flex-shrink-0 text-[11px] font-medium"
                    style={{ color: isWaitingBoss ? "var(--color-coral)" : "var(--muted-foreground)" }}
                  >
                    {STATUS_LABEL[w.status] ?? w.status}
                  </span>
                </div>

                {/* 類型 · 潛點 · 日期 · 人數 · 預算 */}
                <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {TYPE_LABEL[w.type] ?? w.type}
                  {`・${sitesAll || "—"}`}
                  {`・${w.preferredDate.slice(0, 10)}`}
                  {`・${w.participants} 人`}
                  {w.budgetPerPerson != null ? `・NT$ ${w.budgetPerPerson.toLocaleString()}/人` : ""}
                </div>

                {/* 對話 preview */}
                <div className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {lastMsg ? (
                    <span className="line-clamp-1">
                      {lastMsg.from === "boss" ? "老闆" : "客戶"}：{lastMsg.text}
                    </span>
                  ) : w.customerNote ? (
                    <span className="line-clamp-1">客戶備註：{w.customerNote}</span>
                  ) : (
                    <span className="italic">尚無對話</span>
                  )}
                </div>

                {/* footer：對話數 + 時間 */}
                <div
                  className="mt-1 flex items-center justify-between text-[10px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <span>對話 {w.messages?.length ?? 0} 則</span>
                  <span>{formatRelTime(w.lastActivityAt)}</span>
                </div>
              </Link>

              {/* 回覆區（待回覆 / 討論中才有） */}
              {canReply && (
                <div className="mt-2 border-t pt-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  {replyOpen === w.id ? (
                    <div>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="輸入回覆內容（會以 LINE 通知客戶）"
                        rows={3}
                        className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
                        style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}
                      />
                      {replyErr && (
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-coral)" }}>
                          {replyErr}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeReply}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <X className="h-3.5 w-3.5" />
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => submitReply(w.id)}
                          disabled={replying || !replyText.trim()}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                          style={{ background: "var(--color-ocean-deep)", color: "#fff" }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {replying ? "送出中..." : "送出回覆"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openReply(w.id)}
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--color-ocean-deep)" }}
                    >
                      <MessageSquareReply className="h-3.5 w-3.5" />
                      回覆
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 載入 / 空狀態 */}
      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
      {!loading && wishes.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有符合條件的願望單
        </div>
      )}
    </MobileAdminShell>
  );
}
