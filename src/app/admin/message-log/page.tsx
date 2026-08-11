"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

interface UItem {
  id: string;
  kind: "log" | "email";
  direction: "in" | "out";
  channel: "line" | "email" | "inapp";
  status: string;
  recipient: string;
  title: string;
  category: string;
  error: string | null;
  threadId: string | null;
  createdAt: string;
}
interface Stats { waiting: number; weekInbound: number; sent: number; failed: number; openRate: number | null }

// v1053：一則通知（三個通道合併後）
interface UGroup {
  key: string;
  createdAt: string;
  direction: "in" | "out";
  who: string;
  recipientId: string | null;
  recipients: string[];
  module: string;
  moduleLabel: string;
  action: string;
  title: string;
  refType: string | null;
  refId: string | null;
  refLabel: string | null;
  threadId: string | null;
  channels: { channel: string; status: string; error: string | null; recipient: string; id: string }[];
}

// 模組晶片配色：同一組色也用在篩選 chip 上
const MODULE_STYLE: Record<string, { bg: string; c: string }> = {
  notify:          { bg: "#e7f2fb", c: "#1d6ba6" },
  broadcast:       { bg: "#fdf0d5", c: "#9a6212" },
  weather:         { bg: "#e0f2fe", c: "#0369a1" },
  coach:           { bg: "#e4f5ea", c: "#1a7f43" },
  contact:         { bg: "#f3e8ff", c: "#6d28d9" },
  "custom-order":  { bg: "#e6f6f4", c: "#0a7c7c" },
  "admin-notify":  { bg: "#eaeeff", c: "#3f45b8" },
  assistant:       { bg: "#f0f2f5", c: "#5a6b72" },
  test:            { bg: "#f0f2f5", c: "#7c8a96" },
  system:          { bg: "#f0f2f5", c: "#7c8a96" },
};
const modStyle = (m: string) => MODULE_STYLE[m] ?? MODULE_STYLE.system;

/** 通道點：綠＝送出、紅＝失敗、灰＝沒發（客戶關掉該通道，是 skipped 不是失敗） */
function chDot(status: string): { bg: string; op: number; title: string } {
  if (["sent", "delivered", "opened", "received"].includes(status)) return { bg: "#e6f7f1", op: 1, title: "已送出" };
  if (["failed", "bounced"].includes(status)) return { bg: "#fdecea", op: 1, title: "失敗" };
  return { bg: "#f0f2f5", op: 0.45, title: "沒發（略過）" };
}

const DIR: Record<string, { arrow: string; color: string; label: string }> = {
  in: { arrow: "↙", color: "#2563eb", label: "收到" },
  out: { arrow: "↗", color: "#0a8f6a", label: "寄出" },
};
const CHANNEL: Record<string, { icon: string; label: string }> = {
  line: { icon: "💬", label: "LINE" },
  email: { icon: "✉️", label: "Email" },
  inapp: { icon: "📬", label: "站內" },
};
const STATUS: Record<string, { t: string; bg: string; c: string }> = {
  received: { t: "已收到", bg: "#e6f1fb", c: "#185fa5" },
  queued: { t: "排隊中", bg: "#f0f2f5", c: "#7c8a96" },
  skipped: { t: "已略過", bg: "#f0f2f5", c: "#7c8a96" },
  sent: { t: "已送出", bg: "#e6f7f1", c: "#0a8f6a" },
  delivered: { t: "已送達", bg: "#e6f7f1", c: "#0a8f6a" },
  opened: { t: "已開啟", bg: "#e6f7f1", c: "#0a8f6a" },
  failed: { t: "失敗", bg: "#fdecea", c: "#c0392b" },
  bounced: { t: "退信", bg: "#fdecea", c: "#c0392b" },
};

// v1053：一律顯示日期 —— 只有時間會分不出是今天還是上週的同一則通知
const WD = ["日", "一", "二", "三", "四", "五", "六"];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}/`;
  return `${y}${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}（${WD[d.getDay()]}）`;
}
function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MessageLogPage() {
  const [items, setItems] = useState<UItem[]>([]);
  const [groups, setGroups] = useState<UGroup[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null); // v1053：展開哪一列看通道細節
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    if (reset) { setLoading(true); setErr(null); }
    else setLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      if (direction) qs.set("direction", direction);
      if (channel) qs.set("channel", channel);
      if (status) qs.set("status", status);
      if (!reset && nextCursor) qs.set("cursor", nextCursor);
      const d = await adminFetch<{ items: UItem[]; groups: UGroup[]; nextCursor: string | null; stats: Stats }>(`/api/admin/message-log?${qs}`);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
      setGroups((prev) => (reset ? (d.groups ?? []) : [...prev, ...(d.groups ?? [])]));
      setNextCursor(d.nextCursor);
      setStats(d.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false); setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, channel, status, nextCursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [direction, channel, status]);

  const hasFilter = !!(direction || channel || status);
  const clearFilter = () => { setDirection(""); setChannel(""); setStatus(""); };

  const KPI = stats ? [
    { label: "待回覆", v: stats.waiting, c: "#185fa5", bg: "#e6f1fb", filter: () => { clearFilter(); setStatus("received"); } },
    { label: "失敗 · 退信", v: stats.failed, c: "#c0392b", bg: "#fdecea", filter: () => { clearFilter(); setStatus("failed"); } },
    { label: "已送出", v: stats.sent, c: "#0a8f6a", bg: "#fff" },
    { label: "Email 開啟率", v: stats.openRate == null ? "—" : `${stats.openRate}%`, c: "#1a2330", bg: "#fff" },
    { label: "本週詢問", v: stats.weekInbound, c: "#185fa5", bg: "#fff" },
  ] : [];

  return (
    <AdminShell title="通訊紀錄">
      <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
        <p style={{ fontSize: 12.5, color: "#5a6b72", marginBottom: 12 }}>
          客戶詢問 · 客服回覆 · 系統通知 —— 所有對內/對外訊息一覽。<span style={{ color: "#185fa5" }}>↙ 收到</span> · <span style={{ color: "#0a8f6a" }}>↗ 寄出</span>。
          一則通知會同時走 LINE／Email／站內，這裡<b>合併成一列</b>；點任一列可展開看各通道的送達狀況。
          <span style={{ color: "#9aabae" }}>（「對應訂單」自 v1053 起才有紀錄，之前發出的訊息一律顯示「—」。）</span>
        </p>

        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(108px,1fr))", gap: 8, marginBottom: 14 }}>
            {KPI.map((s) => (
              <div key={s.label} onClick={s.filter} style={{ background: s.bg, border: "1px solid #e3e9ec", borderRadius: 10, padding: "10px 12px", textAlign: "center", cursor: s.filter ? "pointer" : "default" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#7c8a96" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} style={selStyle}>
            <option value="">方向：全部</option>
            <option value="in">↙ 收到</option>
            <option value="out">↗ 寄出</option>
          </select>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={selStyle}>
            <option value="">通道：全部</option>
            <option value="line">LINE</option>
            <option value="email">Email</option>
            <option value="inapp">站內</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
            <option value="">狀態：全部</option>
            <option value="received">已收到</option>
            <option value="opened">已開啟</option>
            <option value="failed">失敗 · 退信</option>
          </select>
          {hasFilter && (
            <button onClick={clearFilter} style={{ ...selStyle, cursor: "pointer", color: "#185fa5" }}>清除篩選</button>
          )}
        </div>

        {err && <div style={{ background: "#fdecea", color: "#c0392b", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        {loading ? (
          <p style={{ fontSize: 13, color: "#7c8a96" }}>載入中…</p>
        ) : groups.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7c8a96", padding: "20px 0", textAlign: "center" }}>
            {hasFilter ? "這個條件下沒有紀錄,調整篩選試試。" : "目前沒有任何通訊紀錄。"}
          </p>
        ) : (
          /* v1053：六欄表格。一則通知一列，三個通道收成三顆點；點列展開看各通道細節 */
          <div style={{ background: "#fff", border: "1px solid #e3e9ec", borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 880 }}>
              <thead>
                <tr style={{ background: "#f6f8fa", color: "#7c8a96", fontSize: 11, textAlign: "left" }}>
                  <th style={thStyle}>時間</th>
                  <th style={thStyle}>給誰</th>
                  <th style={thStyle}>模組</th>
                  <th style={thStyle}>動作</th>
                  <th style={thStyle}>對應訂單</th>
                  <th style={{ ...thStyle, width: 130 }}>通道 · 結果</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const dir = DIR[g.direction];
                  const bad = g.channels.filter((c) => ["failed", "bounced"].includes(c.status)).length;
                  const ok = g.channels.filter((c) => ["sent", "delivered", "opened", "received"].includes(c.status)).length;
                  const open = openKey === g.key;
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => setOpenKey(open ? null : g.key)}
                        style={{ borderTop: "1px solid #eef2f4", cursor: "pointer", background: open ? "#f8fbfd" : undefined }}
                      >
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(g.createdAt)}</div>
                          <div style={{ fontSize: 11, color: "#7c8a96", fontVariantNumeric: "tabular-nums" }}>
                            <span style={{ color: dir.color, fontWeight: 800 }}>{dir.arrow}</span> {fmtClock(g.createdAt)}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{g.who}</div>
                          {g.recipients.length > 0 && (
                            <div style={{ fontSize: 10.5, color: "#9aabae", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {g.recipients.filter((r) => r !== g.who).join(" · ") || "—"}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", ...modStyle(g.module) }}>
                            {g.moduleLabel}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{g.action}</div>
                          <div style={{ fontSize: 10.5, color: "#7c8a96", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</div>
                        </td>
                        <td style={tdStyle}>
                          {g.refLabel ? (
                            /* v1054：帶 ?code= 直接鎖定該筆訂單（訂單頁會略過狀態/場次篩選，才不會變空清單） */
                            <Link href={`/admin/bookings?code=${encodeURIComponent(g.refLabel)}`} onClick={(e) => e.stopPropagation()}
                              style={{ fontFamily: "Inter,ui-monospace,monospace", fontSize: 11, color: "#0a7c7c", background: "#e6f6f4", borderRadius: 5, padding: "1px 6px", textDecoration: "none", whiteSpace: "nowrap" }}>
                              {g.refLabel}
                            </Link>
                          ) : (
                            <span style={{ color: "#c3ccd2" }}>—</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 3 }}>
                            {g.channels.map((c) => {
                              const d = chDot(c.status);
                              return (
                                <span key={c.id} title={`${(CHANNEL[c.channel] ?? CHANNEL.inapp).label}：${d.title}`}
                                  style={{ width: 20, height: 20, borderRadius: 6, background: d.bg, opacity: d.op, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                                  {(CHANNEL[c.channel] ?? CHANNEL.inapp).icon}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2, color: bad > 0 ? "#c0392b" : "#0a8f6a" }}>
                            {open ? "▴ 收起" : bad > 0 ? `▾ ${bad} 個失敗` : `▾ ${ok} 個送達`}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: "#f8fbfd" }}>
                          <td colSpan={6} style={{ padding: "8px 12px 12px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {g.channels.map((c) => {
                                const st = STATUS[c.status] ?? STATUS.sent;
                                const ch = CHANNEL[c.channel] ?? CHANNEL.inapp;
                                return (
                                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                                    <span style={{ width: 62, color: "#5a6b72" }}>{ch.icon} {ch.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, padding: "1px 8px", borderRadius: 20 }}>{st.t}</span>
                                    <span style={{ color: "#7c8a96", fontSize: 11 }}>{c.recipient}</span>
                                    {c.error && <span style={{ color: "#c0392b", fontSize: 11 }}>⚠ {c.error}</span>}
                                  </div>
                                );
                              })}
                              {g.threadId && (
                                <Link href={`/admin/email?thread=${g.threadId}`} style={{ fontSize: 11.5, color: "#185fa5", marginTop: 2 }}>
                                  開啟客服信箱對話 ›
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {nextCursor && (
              <button onClick={() => load(false)} disabled={loadingMore} style={{ width: "100%", padding: "10px", border: 0, borderTop: "1px solid #eef2f4", background: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {loadingMore ? "載入中…" : "載入更多"}
              </button>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const selStyle: React.CSSProperties = { fontSize: 12.5, padding: "6px 10px", borderRadius: 8, border: "1px solid #cdd9de", background: "#fff" };
const thStyle: React.CSSProperties = { padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "9px 12px", verticalAlign: "top" };
