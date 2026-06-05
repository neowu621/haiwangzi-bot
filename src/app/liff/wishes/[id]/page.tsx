"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Message {
  from: "customer" | "boss";
  text: string;
  at: string;
}

interface Wish {
  id: string;
  type: "boat" | "shore" | "night" | "tour";
  preferredDate: string;
  alternativeDates: string[];
  diveSiteIds: string[];
  otherSites: string | null;
  participants: number;
  budgetPerPerson: number | null;
  customerNote: string | null;
  referenceImages: Array<{ url: string; type: "r2" | "link"; caption?: string }>;
  messages: Message[];
  status: "pending" | "discussing" | "converted" | "cancelled";
  cancelledBy: string | null;
  cancellationReason: string | null;
  convertedTripId: string | null;
  convertedTourId: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  boat: "🚤 船潛",
  shore: "🏖 岸潛",
  night: "🌙 夜潛",
  tour: "✈️ 潛水團",
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "muted" | "gold" | "coral" }> = {
  pending: { label: "🟡 待回覆", variant: "gold" },
  discussing: { label: "💬 討論中", variant: "gold" },
  converted: { label: "🟢 場次已開", variant: "default" },
  cancelled: { label: "⚪ 已取消", variant: "muted" },
};

export default function WishDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const liff = useLiff();
  const router = useRouter();
  const [wish, setWish] = useState<Wish | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await liff.fetchWithAuth<{ wish: Wish }>(`/api/dive-wishes/${id}`);
      setWish(r.wish);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, liff.ready]);

  async function reply() {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await liff.fetchWithAuth(`/api/dive-wishes/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: replyText, attachments: [] }),
      });
      setReplyText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function cancelWish() {
    const reason = prompt("為什麼取消？（選填）");
    if (reason === null) return; // 按 cancel
    try {
      await liff.fetchWithAuth(`/api/dive-wishes/${id}?reason=${encodeURIComponent(reason)}`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      alert("取消失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (loading) {
    return <LiffShell title="預約潛水" bottomNav={<BottomNav />}><div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div></LiffShell>;
  }
  if (!wish) {
    return <LiffShell title="預約潛水" bottomNav={<BottomNav />}><div className="px-4 py-12 text-center text-sm text-[var(--color-coral)]">{error ?? "找不到此願望單"}</div></LiffShell>;
  }

  const statusMeta = STATUS_LABEL[wish.status] ?? { label: wish.status, variant: "muted" as const };
  const canInteract = wish.status === "pending" || wish.status === "discussing";

  return (
    <LiffShell title="預約潛水" backHref="/liff/my" bottomNav={<BottomNav />}>
      <div className="space-y-3 px-4 pt-4 pb-28">
        <div className="flex items-center justify-between">
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          <span className="text-[11px] text-[var(--muted-foreground)] tabular">{new Date(wish.createdAt).toLocaleDateString("zh-TW")}</span>
        </div>

        {/* 提案內容 */}
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-bold text-base">📦 我的提案</div>
            <div className="grid grid-cols-[64px_1fr] gap-y-1 text-xs">
              <div className="text-[var(--muted-foreground)]">類型</div>
              <div className="font-semibold">{TYPE_LABEL[wish.type]}</div>
              <div className="text-[var(--muted-foreground)]">第一順位</div>
              <div className="font-semibold tabular">{wish.preferredDate.slice(0, 10)}</div>
              {wish.alternativeDates.length > 0 && (
                <>
                  <div className="text-[var(--muted-foreground)]">備選</div>
                  <div className="tabular">{wish.alternativeDates.map(d => d.slice(0, 10)).join("、")}</div>
                </>
              )}
              <div className="text-[var(--muted-foreground)]">潛點</div>
              <div>{[...wish.diveSiteIds, wish.otherSites ?? ""].filter(Boolean).join("、")}</div>
              <div className="text-[var(--muted-foreground)]">人數</div>
              <div>×{wish.participants} 人</div>
              {wish.budgetPerPerson && (
                <>
                  <div className="text-[var(--muted-foreground)]">預算</div>
                  <div>NT$ {wish.budgetPerPerson.toLocaleString()} / 人</div>
                </>
              )}
            </div>
            {wish.customerNote && (
              <div className="mt-2 rounded bg-[var(--muted)]/40 p-2 text-xs">💬 {wish.customerNote}</div>
            )}
            {wish.referenceImages.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] text-[var(--muted-foreground)]">參考連結：</div>
                {wish.referenceImages.map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noopener" className="block text-[11px] text-[var(--color-ocean-deep)] underline break-all">
                    {img.url}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 已開場次 — 預約按鈕 */}
        {wish.status === "converted" && (wish.convertedTripId || wish.convertedTourId) && (
          <Card className="bg-emerald-50 border-emerald-300 border-2">
            <CardContent className="p-4 text-center">
              <div className="text-base font-bold text-emerald-700 mb-2">🎉 場次已開出來了</div>
              <Link href={wish.convertedTripId ? `/liff/dive/trip/${wish.convertedTripId}` : `/liff/tour/${wish.convertedTourId}`}>
                <Button className="w-full">👉 立即預約</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* 取消理由 */}
        {wish.status === "cancelled" && (
          <Card className="bg-gray-50">
            <CardContent className="p-4 text-sm">
              <div className="font-bold mb-1">⚪ 已取消（{wish.cancelledBy === "boss" ? "老闆" : wish.cancelledBy === "system" ? "系統" : "您"}）</div>
              {wish.cancellationReason && (
                <div className="text-xs text-[var(--muted-foreground)]">原因：{wish.cancellationReason}</div>
              )}
              <div className="mt-3">
                <Link href="/liff/wishes/new">
                  <Button variant="outline" size="sm" className="w-full">📝 重新提出新願望單</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 討論串 */}
        {wish.messages.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="font-bold text-base">💬 對話紀錄</div>
              {wish.messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-sm ${m.from === "boss" ? "bg-cyan-50 border border-cyan-200" : "bg-[var(--muted)]/40"}`}
                >
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">
                    {m.from === "boss" ? "💼 老闆" : "👤 您"} · {new Date(m.at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 回覆/取消 */}
        {canInteract && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-bold">回覆訊息</div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                placeholder="輸入想跟老闆說的話..."
                rows={3}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <div className="text-[10px] text-right text-[var(--muted-foreground)]">{replyText.length} / 2000</div>
              <Button className="w-full" disabled={!replyText.trim() || sending} onClick={reply}>
                {sending ? "送出中..." : "📤 送出回覆"}
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={cancelWish}>
                ✕ 取消這個願望單
              </Button>
              <p className="text-[10px] text-center text-[var(--muted-foreground)]">老闆會在 LINE 收到您的回覆通知</p>
            </CardContent>
          </Card>
        )}

        <Button variant="outline" className="w-full" onClick={() => router.push("/liff/my")}>
          回我的預約
        </Button>
      </div>
    </LiffShell>
  );
}
