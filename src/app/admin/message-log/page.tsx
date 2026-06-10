"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

interface LogItem {
  id: string;
  channel: string;
  templateKey: string;
  recipient: string;
  title: string;
  status: string;
  error: string | null;
  source: string;
  createdAt: string;
}
interface Stats { sent: number; failed: number; skipped: number; line: number; email: number; inapp: number }

const CHANNEL_LABEL: Record<string, string> = { line: "💬 LINE", email: "✉️ Email", inapp: "📬 站內" };
const STATUS_STYLE: Record<string, { t: string; bg: string; c: string }> = {
  sent: { t: "已送出", bg: "#e6f7f1", c: "#0a8f6a" },
  failed: { t: "失敗", bg: "#fdecea", c: "#c0392b" },
  skipped: { t: "略過", bg: "#f0f2f5", c: "#7c8a96" },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MessageLogPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
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
      if (channel) qs.set("channel", channel);
      if (status) qs.set("status", status);
      if (!reset && nextCursor) qs.set("cursor", nextCursor);
      const d = await adminFetch<{ items: LogItem[]; nextCursor: string | null; stats: Stats }>(`/api/admin/message-log?${qs}`);
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]));
      setNextCursor(d.nextCursor);
      setStats(d.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false); setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, status, nextCursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [channel, status]);

  return (
    <AdminShell title="訊息發送紀錄">
      <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
        <p style={{ fontSize: 12.5, color: "#5a6b72", marginBottom: 12 }}>
          系統對外發送的每一封 LINE / Email / 站內通知都記錄在此（含收件人、模板、狀態、失敗原因）。近 7 天統計：
        </p>

        {/* 近 7 天概況 */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 8, marginBottom: 14 }}>
            {[
              { k: "sent", label: "已送出", v: stats.sent, c: "#0a8f6a" },
              { k: "failed", label: "失敗", v: stats.failed, c: "#c0392b" },
              { k: "line", label: "LINE", v: stats.line, c: "#06c755" },
              { k: "email", label: "Email", v: stats.email, c: "#2563eb" },
              { k: "inapp", label: "站內", v: stats.inapp, c: "#8b5cf6" },
            ].map((s) => (
              <div key={s.k} style={{ background: "#fff", border: "1px solid #e3e9ec", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#7c8a96" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 篩選 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={selStyle}>
            <option value="">全部通道</option>
            <option value="line">LINE</option>
            <option value="email">Email</option>
            <option value="inapp">站內通知</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
            <option value="">全部狀態</option>
            <option value="sent">已送出</option>
            <option value="failed">失敗</option>
            <option value="skipped">略過</option>
          </select>
        </div>

        {err && <div style={{ background: "#fdecea", color: "#c0392b", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        {loading ? (
          <p style={{ fontSize: 13, color: "#7c8a96" }}>載入中…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7c8a96" }}>目前沒有發送紀錄。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((m) => {
              const st = STATUS_STYLE[m.status] ?? STATUS_STYLE.skipped;
              return (
                <div key={m.id} style={{ background: "#fff", border: "1px solid #e3e9ec", borderRadius: 10, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0e4c5a", minWidth: 64 }}>{CHANNEL_LABEL[m.channel] ?? m.channel}</span>
                  <span style={{ flex: 1, minWidth: 160 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2330" }}>{m.title}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#7c8a96" }}>給 {m.recipient} · {m.templateKey} · {m.source}</span>
                    {m.error && <span style={{ display: "block", fontSize: 11, color: "#c0392b" }}>⚠ {m.error}</span>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, padding: "2px 9px", borderRadius: 20 }}>{st.t}</span>
                  <span style={{ fontSize: 11, color: "#9aabae", minWidth: 84, textAlign: "right" }}>{fmtTime(m.createdAt)}</span>
                </div>
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
