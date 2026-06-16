"use client";
import { useCallback, useEffect, useState } from "react";
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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MessageLogPage() {
  const [items, setItems] = useState<UItem[]>([]);
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
      const d = await adminFetch<{ items: UItem[]; nextCursor: string | null; stats: Stats }>(`/api/admin/message-log?${qs}`);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
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
          客戶詢問 · 客服回覆 · 系統通知 —— 所有對內/對外訊息一覽。<span style={{ color: "#185fa5" }}>↙ 收到</span> · <span style={{ color: "#0a8f6a" }}>↗ 寄出</span>;可點的列會開到客服信箱對話。
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
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7c8a96", padding: "20px 0", textAlign: "center" }}>
            {hasFilter ? "這個條件下沒有紀錄,調整篩選試試。" : "目前沒有任何通訊紀錄。"}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((m) => {
              const dir = DIR[m.direction], ch = CHANNEL[m.channel] ?? CHANNEL.inapp, st = STATUS[m.status] ?? STATUS.sent;
              const inner = (
                <>
                  <span style={{ flex: "0 0 auto", width: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: dir.color }}>{dir.arrow}</span>
                    <span style={{ fontSize: 15 }}>{ch.icon}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 150, overflow: "hidden" }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1a2330", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#7c8a96", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.direction === "in" ? "來自 " : "給 "}{m.recipient}
                      <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 20, background: "#f0f2f5", color: "#7c8a96", fontSize: 10 }}>{m.category}</span>
                    </span>
                    {m.error && <span style={{ display: "block", fontSize: 11, color: "#c0392b" }}>⚠ {m.error}</span>}
                  </span>
                  <span style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, padding: "2px 9px", borderRadius: 20 }}>{st.t}</span>
                    <span style={{ fontSize: 10.5, color: "#9aabae" }}>{fmtTime(m.createdAt)}{m.threadId ? " ›" : ""}</span>
                  </span>
                </>
              );
              const rowStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ec", borderRadius: 10, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" };
              return m.threadId ? (
                <Link key={m.id} href={`/admin/email?thread=${m.threadId}`} style={{ ...rowStyle, cursor: "pointer" }}>{inner}</Link>
              ) : (
                <div key={m.id} style={rowStyle}>{inner}</div>
              );
            })}
            {nextCursor && (
              <button onClick={() => load(false)} disabled={loadingMore} style={{ marginTop: 8, padding: "9px", borderRadius: 8, border: "1px solid #cdd9de", background: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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
