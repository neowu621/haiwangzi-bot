"use client";
// 手機後台「會員查詢」（/admin/m/users）— v736
//   輸入關鍵字才查（/api/admin/users?q=）。點一筆 → 底部彈窗：聯繫方式(電話直撥 / LINE 傳訊息)
//   + 進行中訂單(未結束/未取消，含已下訂未匯款)。訂單再點 → 訂單詳細彈窗(<OrderDetail>)。
import { useEffect, useState, useCallback } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { getVipTier } from "@/lib/vip-tier";
import { toTaipeiDateString } from "@/lib/utils";
import { OrderDetail } from "@/components/admin-web/OrderDetail";
import { Search, Phone, MessageCircle, X, ChevronRight } from "lucide-react";

interface MUser {
  lineUserId: string;
  code: string | null;
  displayName: string;
  realName: string | null;
  phone: string | null;
  vipLevel: number;
  creditBalance: number;
  logCount: number;
  haiwangziLogCount: number;
  lastActiveAt: string;
}
interface Resp { users: MUser[] }

interface OrderLite {
  id: string;
  code: string | null;
  type: "daily" | "tour";
  participants: number;
  date: string | null;
  title: string;
  totalAmount: number;
  payable: number;
  paymentStatus: string;
  status: string;
  statusLabel: string;
}
interface MemberDetail {
  user: { lineUserId: string; name: string; phone: string | null; code: string | null; hasLine: boolean };
  orders: OrderLite[];
}

export default function MobileUsersPage() {
  const { ready } = useAdminAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [users, setUsers] = useState<MUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 會員彈窗
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  // 訂單詳細彈窗（疊在會員彈窗之上）
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    // v797：沒搜尋時預設顯示「這兩天有登入的會員」；有搜尋則走關鍵字查詢
    const url = debouncedQ
      ? `/api/admin/users?q=${encodeURIComponent(debouncedQ)}`
      : `/api/admin/users?activeDays=2`;
    adminFetch<Resp>(url)
      .then((d) => { if (alive) { setUsers(d.users ?? []); setSearched(true); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "查詢失敗"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ready, debouncedQ]);

  const loadDetail = useCallback((uid: string) => {
    setDetailLoading(true);
    setDetail(null);
    setComposeOpen(false);
    setComposeText("");
    setSendMsg(null);
    adminFetch<MemberDetail>(`/api/admin/m/users/${uid}`)
      .then((d) => setDetail(d))
      .catch((e) => setSendMsg(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setDetailLoading(false));
  }, []);

  function openMember(uid: string) {
    setOpenUser(uid);
    loadDetail(uid);
  }

  async function sendLine() {
    if (!openUser || !composeText.trim()) return;
    setSending(true);
    setSendMsg(null);
    try {
      await adminFetch(`/api/admin/contact-customer`, {
        method: "POST",
        body: JSON.stringify({ userId: openUser, message: composeText.trim(), channels: ["line"] }),
      });
      setSendMsg("✓ 已透過 LINE 傳送給會員");
      setComposeText("");
      setComposeOpen(false);
    } catch (e) {
      setSendMsg("傳送失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  return (
    <MobileAdminShell title="會員查詢" back="/admin/m">
      <div className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}>
        <Search className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="輸入姓名 / 電話 / 會員編號查詢" className="min-w-0 flex-1 bg-transparent text-sm outline-none" inputMode="search" autoFocus />
        {q && <button type="button" onClick={() => setQ("")} className="text-xs" style={{ color: "var(--muted-foreground)" }}>清除</button>}
      </div>

      {error && <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>查詢失敗：{error}</div>}

      {/* v797：沒搜尋時的標題 —— 預設列出這兩天有登入的會員 */}
      {!debouncedQ && !loading && (
        <div className="mb-2 px-1 text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          🕑 這兩天登入的會員（{users.length}）
          <span className="ml-1 font-normal opacity-70">・可用上方搜尋找其他人</span>
        </div>
      )}
      {!debouncedQ && !loading && users.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          這兩天沒有會員登入
          <div className="mt-1 text-[11px] opacity-70">用上方搜尋（姓名 / 電話 / 會員編號）找會員</div>
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => {
          const name = u.realName ?? u.displayName;
          const tier = getVipTier(u.vipLevel);
          return (
            <button type="button" key={u.lineUserId} onClick={() => openMember(u.lineUserId)} className="block w-full rounded-xl border px-3 py-2.5 text-left active:scale-[0.99]" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{name}</span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  {u.vipLevel > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-ocean-deep)" }}>LV{u.vipLevel} {tier.name}</span>}
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {u.code ? u.code : "未編號"}{u.phone ? `・${u.phone}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                <span style={{ color: "var(--muted-foreground)" }}>抵用金 <span className="font-mono tabular-nums font-semibold" style={{ color: u.creditBalance > 0 ? "var(--color-coral)" : "inherit" }}>{u.creditBalance.toLocaleString()}</span></span>
                <span style={{ color: "var(--muted-foreground)" }}>潛水 <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--color-ocean-deep)" }}>{u.haiwangziLogCount ?? 0}</span>{u.logCount ? <span className="opacity-60">/{u.logCount}</span> : ""} 次</span>
                {u.lastActiveAt && <span className="font-mono tabular-nums" style={{ color: "var(--muted-foreground)" }}>{toTaipeiDateString(u.lastActiveAt)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {loading && <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>查詢中...</div>}
      {!loading && debouncedQ && searched && users.length === 0 && <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>找不到符合「{debouncedQ}」的會員</div>}
      {!loading && users.length >= 60 && <div className="mt-1 py-2 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>最多顯示 60 筆，請輸入更完整的關鍵字縮小範圍</div>}

      {/* 會員彈窗 */}
      {openUser && (
        <div onClick={() => setOpenUser(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,35,66,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full" style={{ background: "var(--color-pearl, #f4f7fb)", borderRadius: "16px 16px 0 0", maxHeight: "86vh", overflowY: "auto", padding: "14px 14px 28px" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-bold">{detail?.user.name ?? "會員"}</span>
              <button type="button" onClick={() => setOpenUser(null)} aria-label="關閉" style={{ color: "var(--muted-foreground)" }}><X className="h-5 w-5" /></button>
            </div>

            {detailLoading && !detail && <div className="flex justify-center py-6"><DiverLoader label="載入中…" size={80} /></div>}

            {detail && (
              <div className="space-y-3">
                {/* 聯繫方式 */}
                <div className="rounded-xl border p-3.5" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
                  <div className="mb-2 text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>聯繫方式</div>
                  <div className="flex gap-2">
                    {detail.user.phone ? (
                      <a href={`tel:${detail.user.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white" style={{ background: "var(--color-ocean-deep)" }}>
                        <Phone className="h-4 w-4" /> 打電話
                      </a>
                    ) : (
                      <div className="flex-1 rounded-lg py-2 text-center text-xs" style={{ background: "rgba(0,0,0,0.04)", color: "var(--muted-foreground)" }}>無電話</div>
                    )}
                    {detail.user.hasLine && (
                      <button type="button" onClick={() => setComposeOpen((v) => !v)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white" style={{ background: "#06C755" }}>
                        <MessageCircle className="h-4 w-4" /> 用 LINE 傳訊息
                      </button>
                    )}
                  </div>
                  {detail.user.phone && <div className="mt-1.5 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>{detail.user.phone}</div>}

                  {composeOpen && (
                    <div className="mt-3">
                      <textarea value={composeText} onChange={(e) => setComposeText(e.target.value)} rows={3} maxLength={2000} placeholder="輸入要傳給會員的 LINE 訊息…" className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none" style={{ borderColor: "rgba(0,0,0,0.15)", background: "var(--card,#fff)" }} />
                      <button type="button" disabled={sending || !composeText.trim()} onClick={sendLine} className="mt-2 w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#06C755" }}>
                        {sending ? "傳送中…" : "送出 LINE 訊息"}
                      </button>
                    </div>
                  )}
                  {sendMsg && <div className="mt-2 text-center text-[11px]" style={{ color: sendMsg.startsWith("✓") ? "#047857" : "var(--color-coral)" }}>{sendMsg}</div>}
                </div>

                {/* 進行中訂單 */}
                <div>
                  <div className="mb-1.5 px-1 text-sm font-bold" style={{ color: "var(--color-ocean-deep)" }}>進行中訂單（{detail.orders.length}）</div>
                  {detail.orders.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: "rgba(0,0,0,0.12)", color: "var(--muted-foreground)" }}>沒有進行中的訂單</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.orders.map((o) => {
                        const needsPayment = o.paymentStatus !== "fully_paid" && o.paymentStatus !== "refunded" && o.totalAmount > 0;
                        return (
                          <button type="button" key={o.id} onClick={() => setOpenOrderId(o.id)} className="block w-full rounded-xl border px-3 py-2.5 text-left active:scale-[0.99]" style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold">{o.type === "tour" ? "✈️" : "🔱"} {o.title}</span>
                              <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: needsPayment ? "var(--color-coral)" : "var(--muted-foreground)" }}>${(needsPayment ? o.payable : o.totalAmount).toLocaleString()}</span>
                            </div>
                            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                              {o.date ? `${o.date}・` : ""}{o.participants} 位{o.code ? `・${o.code}` : ""}
                              <span className="ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(10,35,66,0.06)", color: "var(--color-ocean-deep)" }}>{o.statusLabel}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 訂單詳細彈窗（疊在會員彈窗之上） */}
      {openOrderId && (
        <div onClick={() => setOpenOrderId(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,35,66,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full" style={{ background: "var(--color-pearl, #f4f7fb)", borderRadius: "16px 16px 0 0", maxHeight: "86vh", overflowY: "auto", padding: "14px 14px 28px" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-bold">訂單詳細</span>
              <button type="button" onClick={() => setOpenOrderId(null)} aria-label="關閉" style={{ color: "var(--muted-foreground)" }}><X className="h-5 w-5" /></button>
            </div>
            <OrderDetail id={openOrderId} onActed={() => openUser && loadDetail(openUser)} />
          </div>
        </div>
      )}
    </MobileAdminShell>
  );
}
