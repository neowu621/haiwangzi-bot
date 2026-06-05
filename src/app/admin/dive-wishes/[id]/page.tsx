"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Message { from: "customer" | "boss"; text: string; at: string; }
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
  referenceImages: Array<{ url: string; type: "r2" | "link" }>;
  messages: Message[];
  status: string;
  cancelledBy: string | null;
  cancellationReason: string | null;
  convertedTripId: string | null;
  convertedTourId: string | null;
  createdAt: string;
  user: { displayName: string; realName: string | null; phone: string | null; email: string | null; lineUserId: string };
}

const TYPE_LABEL: Record<string, string> = {
  boat: "🚤 船潛 (daily)", shore: "🏖 岸潛 (daily)", night: "🌙 夜潛 (daily)", tour: "✈️ 潛水團 (tour)",
};

export default function AdminWishDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [wish, setWish] = useState<Wish | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // v321：通道選擇
  const [useLine, setUseLine] = useState(true);
  const [useEmail, setUseEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");

  async function load() {
    try {
      const r = await adminFetch<{ wish: Wish }>(`/api/admin/dive-wishes/${id}`);
      setWish(r.wish);
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function sendReply() {
    if (!replyText.trim() || !wish) return;
    const channels: string[] = [];
    if (useLine) channels.push("line");
    if (useEmail && wish.user.email) channels.push("email");
    if (channels.length === 0) {
      setMsg("請至少勾選一個通道");
      return;
    }
    setSending(true);
    try {
      const r = await adminFetch<{ ok: boolean; results: Record<string, { ok: boolean; error?: string }> }>(
        `/api/admin/dive-wishes/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            text: replyText,
            channels,
            emailSubject: emailSubject || undefined,
          }),
        },
      );
      const parts: string[] = [];
      if (r.results?.line) parts.push(`LINE：${r.results.line.ok ? "✓" : "❌ " + r.results.line.error}`);
      if (r.results?.email) parts.push(`Email：${r.results.email.ok ? "✓" : "❌ " + r.results.email.error}`);
      const allOk = Object.values(r.results ?? {}).every((x) => x.ok);
      setMsg((allOk ? "✓ 回覆已送出 — " : "⚠ 部分失敗 — ") + parts.join(" / "));
      setReplyText("");
      setEmailSubject("");
      await load();
    } catch (e) {
      setMsg("送出失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  async function cancelWish() {
    const reason = prompt("請填寫結束對話的原因（會推 LINE 給客戶）：");
    if (!reason || !reason.trim()) return;
    try {
      await adminFetch(`/api/admin/dive-wishes/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      await load();
      setMsg("✓ 已結束對話並通知客戶");
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (!wish) {
    return <AdminShell title="願望單詳情"><p className="py-12 text-center">載入中...</p></AdminShell>;
  }

  const isOpen = wish.status === "pending" || wish.status === "discussing";

  return (
    <AdminShell title={`願望單 #${wish.id.slice(0, 8)}`}>
      <div className="max-w-3xl space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/dive-wishes")}>← 回列表</Button>

        {msg && (
          <div className={`rounded-md p-2 text-sm ${msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg}</div>
        )}

        <div className="flex items-center gap-2">
          <Badge>{wish.status}</Badge>
          <span className="font-bold">{wish.user.realName ?? wish.user.displayName}</span>
          <span className="text-[11px] text-[var(--muted-foreground)]">{wish.user.phone}</span>
        </div>

        {/* 提案內容 */}
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-bold">📦 客戶提案</div>
            <div className="grid grid-cols-[80px_1fr] gap-y-1 text-xs">
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
              {wish.budgetPerPerson && (<><div className="text-[var(--muted-foreground)]">預算</div><div>NT$ {wish.budgetPerPerson.toLocaleString()} / 人</div></>)}
              <div className="text-[var(--muted-foreground)]">客戶聯絡</div>
              <div>📞 {wish.user.phone} / ✉ {wish.user.email}</div>
            </div>
            {wish.customerNote && <div className="rounded bg-[var(--muted)]/40 p-2 text-xs mt-2">💬 {wish.customerNote}</div>}
            {wish.referenceImages.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] text-[var(--muted-foreground)]">參考連結：</div>
                {wish.referenceImages.map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noopener" className="block text-[11px] text-[var(--color-ocean-deep)] underline break-all">{img.url}</a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 討論串 */}
        {wish.messages.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="font-bold">💬 對話紀錄</div>
              {wish.messages.map((m, i) => (
                <div key={i} className={`rounded-lg p-3 text-sm ${m.from === "boss" ? "bg-cyan-50 border border-cyan-200 ml-6" : "bg-gray-50 mr-6"}`}>
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">
                    {m.from === "boss" ? "💼 您" : "👤 客戶"} · {new Date(m.at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 取消狀態顯示 */}
        {wish.status === "cancelled" && (
          <Card className="bg-gray-50">
            <CardContent className="p-4 text-sm">
              <div className="font-bold mb-1">⚪ 已取消（{wish.cancelledBy === "boss" ? "您" : wish.cancelledBy === "system" ? "系統 (7 天無回應)" : "客戶"}）</div>
              {wish.cancellationReason && <div className="text-xs">原因：{wish.cancellationReason}</div>}
            </CardContent>
          </Card>
        )}

        {/* 已開場次 */}
        {wish.status === "converted" && (
          <Card className="bg-emerald-50 border-2 border-emerald-300">
            <CardContent className="p-4 text-center text-sm">
              <div className="font-bold text-emerald-700">✓ 場次已開出</div>
              <a
                className="mt-2 inline-block underline text-[var(--color-ocean-deep)]"
                href={wish.convertedTripId ? `/admin/trips#${wish.convertedTripId}` : `/admin/tours#${wish.convertedTourId}`}
              >
                → 至{wish.convertedTripId ? "日潛場次" : "潛水團"}查看
              </a>
            </CardContent>
          </Card>
        )}

        {/* 回覆 + 操作 */}
        {isOpen && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="font-bold">回覆客戶</div>
              {/* v321：通道選擇 */}
              <div className="flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={useLine} onChange={(e) => setUseLine(e.target.checked)} />
                  📱 LINE
                </label>
                <label className={`inline-flex items-center gap-1 ${!wish.user.email ? "opacity-40" : ""}`}>
                  <input
                    type="checkbox"
                    checked={useEmail}
                    onChange={(e) => setUseEmail(e.target.checked)}
                    disabled={!wish.user.email}
                  />
                  ✉ Email {!wish.user.email && "(未填)"}
                </label>
                {useEmail && wish.user.email && (
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
                    placeholder="Email 主旨（可選）"
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                  />
                )}
              </div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder={useLine && useEmail ? "輸入想跟客戶說的話，按送出同步推 LINE + Email..." : useEmail ? "輸入想跟客戶說的話，按送出寄 Email..." : "輸入想跟客戶說的話，按送出推 LINE..."}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <div className="text-[10px] text-right text-[var(--muted-foreground)]">{replyText.length} / 2000</div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!replyText.trim() || sending || (!useLine && !useEmail)} onClick={sendReply}>{sending ? "送出中..." : "💬 送出回覆"}</Button>
                <Button variant="outline" onClick={() => setConvertOpen(true)} style={{ borderColor: "var(--color-phosphor)", color: "#047857" }}>
                  ✓ 確認開場次
                </Button>
                <Button variant="outline" onClick={cancelWish} style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                  ✕ 結束對話
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 開場次 dialog */}
      {wish && (
        <ConvertDialog
          open={convertOpen}
          wish={wish}
          onClose={() => setConvertOpen(false)}
          onDone={async () => { setConvertOpen(false); await load(); setMsg("✓ 場次已開出，客戶 LINE 已收到通知"); }}
        />
      )}
    </AdminShell>
  );
}

// 開場次 Dialog
function ConvertDialog({ open, wish, onClose, onDone }: { open: boolean; wish: Wish; onClose: () => void; onDone: () => void }) {
  const isTour = wish.type === "tour";
  // daily defaults
  const [date, setDate] = useState(wish.preferredDate.slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [tankCount, setTankCount] = useState(2);
  const [capacity, setCapacity] = useState(Math.max(8, wish.participants + 5));
  const [baseTrip, setBaseTrip] = useState(wish.budgetPerPerson ?? 1200);
  // tour defaults
  const [tourTitle, setTourTitle] = useState("");
  const [tourEnd, setTourEnd] = useState(wish.preferredDate.slice(0, 10));
  const [destination, setDestination] = useState<"northeast" | "green_island" | "lanyu" | "kenting" | "other">("other");
  const [basePrice, setBasePrice] = useState(wish.budgetPerPerson ?? 8000);
  const [deposit, setDeposit] = useState((wish.budgetPerPerson ?? 8000) / 3 | 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const body = isTour
        ? {
            asType: "tour" as const,
            title: tourTitle.trim() || `${wish.otherSites ?? wish.diveSiteIds.join("/")} 潛水團`,
            destination,
            dateStart: wish.preferredDate.slice(0, 10),
            dateEnd: tourEnd,
            diveSiteIds: wish.diveSiteIds,
            basePrice,
            deposit,
            capacity,
            description: wish.customerNote ?? undefined,
          }
        : {
            asType: "daily" as const,
            date,
            startTime,
            diveSiteIds: wish.diveSiteIds,
            tankCount,
            capacity,
            pricing: { baseTrip, extraTank: 500, nightDive: 300, scooterRental: 500 },
            isNightDive: wish.type === "night",
            notes: wish.customerNote ?? undefined,
          };
      await adminFetch(`/api/admin/dive-wishes/${wish.id}/convert`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>✓ 確認開場次 — {isTour ? "潛水團" : "日潛"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {isTour ? (
            <>
              <div><Label>標題</Label><Input value={tourTitle} onChange={(e) => setTourTitle(e.target.value)} placeholder="例：綠島 3 天 2 夜" /></div>
              <div>
                <Label>地區</Label>
                <select value={destination} onChange={(e) => setDestination(e.target.value as typeof destination)} className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  <option value="northeast">東北角</option>
                  <option value="green_island">綠島</option>
                  <option value="lanyu">蘭嶼</option>
                  <option value="kenting">墾丁</option>
                  <option value="other">其他 / 國外</option>
                </select>
              </div>
              <div><Label>結束日期</Label><Input type="date" value={tourEnd} onChange={(e) => setTourEnd(e.target.value)} /></div>
              <div><Label>基本費 / 人</Label><Input type="number" value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} /></div>
              <div><Label>訂金 / 人</Label><Input type="number" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} /></div>
              <div><Label>容量</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
            </>
          ) : (
            <>
              <div><Label>場次日期</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>開始時間</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
              <div><Label>氣瓶數</Label><Input type="number" value={tankCount} onChange={(e) => setTankCount(Number(e.target.value))} /></div>
              <div><Label>容量</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
              <div><Label>基本費</Label><Input type="number" value={baseTrip} onChange={(e) => setBaseTrip(Number(e.target.value))} /></div>
            </>
          )}
          {err && <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button disabled={busy} onClick={go}>{busy ? "建立中..." : "✓ 確認開場次"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
