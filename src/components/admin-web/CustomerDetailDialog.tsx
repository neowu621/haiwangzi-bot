"use client";
/**
 * v320：全站客戶名點擊 → 彈出此 modal
 *
 * 包含三個 section：
 *   1. 客戶基本資料（姓名 / 電話 / Email / 證照 / VIP / 累積消費 / 抵用金 / 訂單數 / 願望單數）
 *   2. 完整討論串（v317 LINE/Email 過去聯絡記錄 timeline）
 *   3. 雙向通知 — 輸入訊息 + 勾 LINE/Email 一鍵發送（沿用 v317 邏輯）
 *
 * 用法：
 *   const [openUserId, setOpenUserId] = useState<string | null>(null);
 *   <CustomerDetailDialog userId={openUserId} onClose={() => setOpenUserId(null)} />
 *   <CustomerNameButton userId={u.lineUserId} name={u.realName ?? u.displayName} onClick={() => setOpenUserId(u.lineUserId)} />
 */
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomerData {
  user: {
    lineUserId: string;
    displayName: string;
    realName: string | null;
    phone: string | null;
    email: string | null;
    emailVerifiedAt: string | null;
    cert: string | null;
    certNumber: string | null;
    logCount: number;
    vipLevel: number;
    creditBalance: number;
    totalSpend: number;
    notifyByLine: boolean;
    notifyByEmail: boolean;
    birthday: string | null;
    role: string;
    createdAt: string;
    lastActiveAt: string;
  };
  stats: { bookingCount: number; wishCount: number };
}

interface ContactLogEntry {
  id: string;
  at: string;
  from: string;
  channels: string[];
  message: string;
  results: Record<string, { ok: boolean; error?: string }>;
}

const VIP_LABEL: Record<number, string> = {
  1: "LV1 小蝦", 2: "LV2 海星", 3: "LV3 章魚", 4: "LV4 海豚", 5: "LV5 鯨鯊",
};

const CERT_LABEL: Record<string, string> = {
  none: "無證照", OW: "OW 初級", AOW: "AOW 進階", Rescue: "Rescue 救援", DM: "DM 潛水長", Instructor: "Instructor 教練",
};

export function CustomerDetailDialog({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [log, setLog] = useState<ContactLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 聯絡訊息 form
  const [msg, setMsg] = useState("");
  const [subject, setSubject] = useState("");
  const [useLine, setUseLine] = useState(true);
  const [useEmail, setUseEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null); setLog([]); setMsg(""); setSubject(""); setResult(null);
      return;
    }
    setLoading(true);
    setErr(null);
    Promise.all([
      adminFetch<CustomerData>(`/api/admin/customers/${encodeURIComponent(userId)}`),
      adminFetch<{ entries: ContactLogEntry[] }>(`/api/admin/customers/${encodeURIComponent(userId)}/contact-log`),
    ])
      .then(([d, l]) => {
        setData(d);
        setLog(l.entries ?? []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [userId]);

  async function send() {
    if (!data || !msg.trim()) return;
    const channels: string[] = [];
    if (useLine) channels.push("line");
    if (useEmail && data.user.email) channels.push("email");
    if (channels.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const r = await adminFetch<{ ok: boolean; results: Record<string, { ok: boolean; error?: string }> }>(
        `/api/admin/contact-customer`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: data.user.lineUserId,
            message: msg,
            channels,
            emailSubject: subject || undefined,
          }),
        },
      );
      const parts: string[] = [];
      if (r.results.line) parts.push(`LINE：${r.results.line.ok ? "✓" : "❌ " + r.results.line.error}`);
      if (r.results.email) parts.push(`Email：${r.results.email.ok ? "✓" : "❌ " + r.results.email.error}`);
      setResult((r.ok ? "✓ 全部送出成功 — " : "⚠ 部分失敗 — ") + parts.join(" / "));
      if (r.ok) { setMsg(""); setSubject(""); }
      // 重抓討論串
      const refreshed = await adminFetch<{ entries: ContactLogEntry[] }>(
        `/api/admin/customers/${encodeURIComponent(data.user.lineUserId)}/contact-log`,
      );
      setLog(refreshed.entries ?? []);
    } catch (e) {
      setResult("❌ 送出失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(95vw,720px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>客戶資訊</DialogTitle>
        </DialogHeader>

        {loading && <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">載入中...</p>}
        {err && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

        {data && (
          <div className="space-y-4">
            {/* Section 1：基本資料 */}
            <section className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                👤 基本資料
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold"
                  style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                  {(data.user.realName ?? data.user.displayName).slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold">{data.user.realName ?? data.user.displayName}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">{data.user.displayName}</div>
                </div>
                <Badge variant="default" className="text-[10px]">{VIP_LABEL[data.user.vipLevel] ?? `LV${data.user.vipLevel}`}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">電話</div>
                  <div className="font-medium tabular-nums">{data.user.phone ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Email</div>
                  <div className="font-medium break-all">
                    {data.user.email ?? "—"}
                    {data.user.email && (
                      <span className={cn("ml-1 text-[10px]", data.user.emailVerifiedAt ? "text-emerald-600" : "text-amber-600")}>
                        {data.user.emailVerifiedAt ? "✓已驗證" : "⚠未驗證"}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">證照</div>
                  <div className="font-medium">
                    {data.user.cert ? `${CERT_LABEL[data.user.cert] ?? data.user.cert}${data.user.certNumber ? ` (${data.user.certNumber})` : ""}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">潛水次數</div>
                  <div className="font-medium tabular-nums">{data.user.logCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">累積消費</div>
                  <div className="font-medium tabular-nums">NT$ {data.user.totalSpend.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">抵用金</div>
                  <div className="font-medium tabular-nums">NT$ {data.user.creditBalance.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">訂單數</div>
                  <div className="font-medium tabular-nums">{data.stats.bookingCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">願望單</div>
                  <div className="font-medium tabular-nums">{data.stats.wishCount}</div>
                </div>
                {data.user.birthday && (
                  <div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">生日</div>
                    <div className="font-medium tabular-nums">{data.user.birthday.slice(0, 10)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">通知偏好</div>
                  <div className="font-medium">
                    {data.user.notifyByLine ? "LINE✓" : "LINE✗"} · {data.user.notifyByEmail ? "Email✓" : "Email✗"}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2：完整討論串 */}
            <section className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                💬 完整討論串（過去 50 筆聯絡記錄）
              </div>
              {log.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] py-2">尚無聯絡記錄</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {log.map((e) => (
                    <div key={e.id} className="rounded-md bg-[var(--muted)]/30 p-2 text-xs">
                      <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
                        <span className="text-[10px] text-[var(--muted-foreground)] tabular">
                          {new Date(e.at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {e.from}
                        </span>
                        <div className="flex gap-1">
                          {e.channels.map((c) => {
                            const r = e.results[c];
                            const ok = r?.ok ?? false;
                            return (
                              <span key={c} className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                              )}>
                                {c === "line" ? "LINE" : "✉Email"} {ok ? "✓" : "✗"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="whitespace-pre-wrap text-[12px]">{e.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section 3：發送訊息 */}
            <section className="rounded-xl border-2 border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ocean-deep)]">
                📨 發送訊息給此客戶
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={useLine} onChange={(e) => setUseLine(e.target.checked)} />
                  LINE
                </label>
                <label className={cn("inline-flex items-center gap-1", !data.user.email && "opacity-40")}>
                  <input
                    type="checkbox"
                    checked={useEmail}
                    onChange={(e) => setUseEmail(e.target.checked)}
                    disabled={!data.user.email}
                  />
                  Email {!data.user.email && "(未填)"}
                </label>
              </div>
              {useEmail && (
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email 主旨（可選）"
                  className="text-xs"
                  maxLength={200}
                />
              )}
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="輸入要發給客戶的訊息..."
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-[var(--muted-foreground)]">{msg.length} / 2000</div>
                <Button
                  size="sm"
                  disabled={!msg.trim() || sending || (!useLine && !useEmail)}
                  onClick={() => void send()}
                >
                  {sending ? "送出中..." : "📤 送出訊息"}
                </Button>
              </div>
              {result && (
                <div className={cn(
                  "rounded-md p-2 text-xs",
                  result.startsWith("✓") ? "bg-emerald-50 text-emerald-700" :
                    result.startsWith("⚠") ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700",
                )}>
                  {result}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 共用客戶名按鈕（全站可點開 modal）
 * 用法：<CustomerNameButton name={...} onClick={() => setOpenUserId(...)} />
 */
export function CustomerNameButton({
  name,
  onClick,
  className,
  subtitle,
}: {
  name: string;
  onClick: () => void;
  className?: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "text-left text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline",
        className,
      )}
    >
      {name}
      {subtitle && <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">{subtitle}</span>}
    </button>
  );
}
