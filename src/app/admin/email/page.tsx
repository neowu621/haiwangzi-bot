"use client";
/**
 * v521：客服信箱 Console — 三欄式收件匣（列表 / 對話 / 回信）。
 * 接後端 5 支 API：/api/admin/email/threads(list)、/threads/[id](detail+patch)、
 *   /threads/[id]/reply、/compose。收信由 cron(/api/cron/email-inbound-poll)讀 Gmail 進 DB。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

type Status = "WAITING" | "PROCESSING" | "CLOSED";
interface Msg {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddr: string;
  toAddr: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  status: string;
  createdAt: string;
  attachments?: { filename: string; size?: number }[] | null;
}
interface Thread {
  id: string;
  subject: string;
  customerEmail: string;
  customerName?: string | null;
  status: Status;
  tags: string[];
  bookingId?: string | null;
  lastMessageAt: string;
  messages: Msg[];
  booking?: { id: string } | null;
}

const ST: Record<Status, { label: string; bg: string; fg: string; dot: string }> = {
  WAITING: { label: "待回覆", bg: "#ffe6df", fg: "#c0432a", dot: "#FF6B4A" },
  PROCESSING: { label: "處理中", bg: "#fcefd6", fg: "#a9701b", dot: "#E08A2B" },
  CLOSED: { label: "已結案", bg: "#e0f3e8", fg: "#1c8f5e", dot: "#2BA66B" },
};
const FILTERS: { key: Status | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "WAITING", label: "待回覆" },
  { key: "PROCESSING", label: "處理中" },
  { key: "CLOSED", label: "已結案" },
];

function fmt(d: string) {
  const dt = new Date(d);
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  return sameDay
    ? dt.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// v548：純文字 URL → 可點連結（React node，安全：只認 http(s)，文字由 React 跳脫）
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
function linkifyNodes(line: string): React.ReactNode[] {
  return line.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#0e7c8a", wordBreak: "break-all" }}>{part}</a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}
// v548：回覆寄出時，把已跳脫文字裡的 URL 包成 <a>（href 用同字串，&amp; 在 href 內合法）
function linkifyHtml(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// v548：安全顯示一封信的內容。
//   ① 純文字版優先（URL 變可點）。② 有 HTML 版可切到「HTML 檢視」——
//   用 sandbox iframe + CSP（default-src none、禁 script、img 只允 data:）安全 render，
//   徹底取代原本未消毒的 dangerouslySetInnerHTML，並擋掉遠端追蹤像素。
function MessageBody({ text, html }: { text?: string | null; html?: string | null }) {
  const hasText = !!(text && text.trim());
  const hasHtml = !!(html && html.trim());
  const [showHtml, setShowHtml] = useState(hasHtml); // v551：有 HTML 版就預設用 HTML 渲染（像 Gmail）
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = hasHtml
    ? `<!doctype html><html><head><meta charset="utf-8">` +
      // v551：允許遠端圖片（信件圖才不會破），仍擋 script / object / frame（XSS 主向量）
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:">` +
      `<base target="_blank">` +
      `<style>body{margin:0;font-family:-apple-system,'Microsoft JhengHei',sans-serif;font-size:14px;line-height:1.6;color:#1a2330;word-break:break-word}a{color:#0e7c8a}</style>` +
      `</head><body>${html}</body></html>`
    : "";

  return (
    <div>
      {hasText && hasHtml && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={() => setShowHtml(false)} style={viewTab(!showHtml)}>純文字</button>
          <button type="button" onClick={() => setShowHtml(true)} style={viewTab(showHtml)}>HTML</button>
        </div>
      )}
      {showHtml && hasHtml ? (
        <iframe
          ref={iframeRef}
          title="email-html"
          // allow-same-origin（不含 allow-scripts）：可量高度自適應，但 JS 仍被禁 → 安全
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          onLoad={() => {
            // v551：量高度自適應；圖片在 onLoad 後才載完 → 延遲重量幾次避免被截斷
            const measure = () => {
              try {
                const h = iframeRef.current?.contentDocument?.body?.scrollHeight;
                if (h) iframeRef.current!.style.height = `${Math.min(h + 8, 1600)}px`;
              } catch { /* ignore */ }
            };
            measure();
            setTimeout(measure, 400);
            setTimeout(measure, 1200);
          }}
          style={{ width: "100%", minHeight: 60, border: "none", background: "#fff" }}
        />
      ) : (
        (text ?? "").split("\n").map((l, i) => (
          <p key={i} style={{ margin: "0 0 6px" }}>{l ? linkifyNodes(l) : " "}</p>
        ))
      )}
    </div>
  );
}
function viewTab(active: boolean): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 7, cursor: "pointer",
    border: `1px solid ${active ? "#0e7c8a" : "#d3e0e3"}`,
    background: active ? "#0e7c8a" : "#fff", color: active ? "#fff" : "#5b7080",
  };
}
function initials(t: Thread) {
  return (t.customerName ?? t.customerEmail).slice(0, 1).toUpperCase();
}
function fmtFull(d: string) {
  return new Date(d).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
interface PollLog {
  id: string; trigger: string; scanned: number; ingested: number; dedup: number; skipped: number; ok: boolean; error?: string | null; ranAt: string;
}

export default function AdminEmailPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollLogs, setPollLogs] = useState<PollLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const loadPollLogs = useCallback(async () => {
    try {
      const d = await adminFetch<{ logs: PollLog[] }>("/api/admin/email/poll");
      setPollLogs(d.logs);
    } catch { /* 忽略 */ }
  }, []);
  useEffect(() => { loadPollLogs(); }, [loadPollLogs]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    if (q.trim()) p.set("q", q.trim());
    try {
      const d = await adminFetch<{ threads: Thread[] }>(`/api/admin/email/threads?${p.toString()}`);
      setThreads(d.threads);
      setSelId((cur) => cur ?? d.threads[0]?.id ?? null);
    } catch (e) {
      showToast("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingList(false);
    }
  }, [filter, q, showToast]);

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const d = await adminFetch<{ thread: Thread }>(`/api/admin/email/threads/${id}`);
      setDetail(d.thread);
    } catch (e) {
      showToast("載入對話失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingDetail(false);
    }
  }, [showToast]);

  useEffect(() => { if (selId) loadDetail(selId); }, [selId, loadDetail]);

  async function send() {
    if (!detail || !reply.trim() || sending) return;
    setSending(true);
    try {
      const html = reply.split("\n").map((l) => `<p>${linkifyHtml(esc(l)) || "&nbsp;"}</p>`).join("");
      await adminFetch(`/api/admin/email/threads/${detail.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ html, text: reply }),
      });
      setReply("");
      showToast("✓ 已寄出回覆（Zeabur Email）");
      await loadDetail(detail.id);
      await loadList();
    } catch (e) {
      showToast("寄送失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(s: Status) {
    if (!detail) return;
    const prev = detail.status;
    setDetail({ ...detail, status: s });
    try {
      await adminFetch(`/api/admin/email/threads/${detail.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
      setThreads((arr) => arr.map((t) => (t.id === detail.id ? { ...t, status: s } : t)));
    } catch {
      setDetail({ ...detail, status: prev });
      showToast("改狀態失敗");
    }
  }

  async function doPoll() {
    if (polling) return;
    setPolling(true);
    try {
      const d = await adminFetch<{ result: { ingested: number; ok: boolean; error?: string }; logs: PollLog[] }>(
        "/api/admin/email/poll",
        { method: "POST" },
      );
      setPollLogs(d.logs);
      if (!d.result.ok) showToast("收信失敗：" + (d.result.error ?? ""));
      else showToast(d.result.ingested > 0 ? `✓ 收到 ${d.result.ingested} 封新信` : "已是最新，沒有新信");
      await loadList();
      if (selId) await loadDetail(selId);
    } catch (e) {
      showToast("收信失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPolling(false);
    }
  }

  async function deleteThread() {
    if (!detail) return;
    const who = detail.customerName ?? detail.customerEmail;
    if (!window.confirm(`確定永久刪除與「${who}」的整條對話？\n所有信件與附件都會一併刪除，且無法復原。`)) return;
    const id = detail.id;
    try {
      await adminFetch(`/api/admin/email/threads/${id}`, { method: "DELETE" });
      setThreads((arr) => arr.filter((t) => t.id !== id));
      setDetail(null);
      setSelId(null);
      showToast("已永久刪除此對話");
      await loadList();
    } catch (e) {
      showToast("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  const counts = useMemo(() => {
    const c = { WAITING: 0, PROCESSING: 0, CLOSED: 0 } as Record<Status, number>;
    threads.forEach((t) => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [threads]);

  return (
    <AdminShell title="客服信箱">
      <div style={{ background: "#f4f8f9", height: "calc(100vh - 56px)", margin: "-1rem", display: "flex", flexDirection: "column" }}>
        {/* top bar：收信鈕在最左 + 最近更新時間 + 紀錄 */}
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #e1ebeb", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "relative" }}>
          <button onClick={doPoll} disabled={polling} style={pollBtn(polling)}>
            {polling ? "收信中…" : "↻ 收信"}
          </button>
          {pollLogs[0] ? (
            <span style={{ fontSize: 12, color: "#4a6168" }}>
              最近更新 <b>{fmtFull(pollLogs[0].ranAt)}</b>
              <span style={{ color: "#0e7c8a", marginLeft: 6 }}>收到 {pollLogs[0].ingested} 封</span>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#9aabae" }}>尚無收信紀錄</span>
          )}
          <button onClick={() => setShowHistory((s) => !s)} style={linkBtn}>更新紀錄 ▾</button>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9aabae" }}>
            對外信箱 service@haiwangzi.xyz · 回信走 Zeabur Email
          </span>
          {showHistory && (
            <div style={historyPanel}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#0a2027" }}>收信紀錄（最近 12 次）</div>
              {pollLogs.length === 0 && <div style={{ fontSize: 12, color: "#9aabae" }}>尚無紀錄</div>}
              {pollLogs.map((l) => (
                <div key={l.id} style={{ display: "flex", gap: 8, fontSize: 11.5, padding: "4px 0", borderTop: "1px solid #f1f4f6", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", color: "#516268" }}>{fmtFull(l.ranAt)}</span>
                  <span style={{ color: l.trigger === "manual" ? "#0e7c8a" : "#9aabae" }}>{l.trigger === "manual" ? "手動" : "自動"}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 600, color: l.ingested > 0 ? "#1c8f5e" : "#9aabae" }}>收到 {l.ingested}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "340px 1fr", minHeight: 0 }}>
          {/* ===== LIST ===== */}
          <div style={{ background: "#fff", borderRight: "1px solid #e1ebeb", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #eef2f2" }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadList(); }}
                placeholder="搜尋寄件人 / 主旨…（Enter）"
                style={searchInput}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)} style={pill(filter === f.key)}>
                    {f.label}
                    {f.key !== "ALL" && <span style={{ opacity: 0.7, marginLeft: 4, fontFamily: "monospace" }}>{counts[f.key as Status] ?? 0}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingList && threads.length === 0 && <div style={empty}>載入中…</div>}
              {!loadingList && threads.length === 0 && (
                <div style={empty}>
                  目前沒有信件。<br />
                  <span style={{ fontSize: 11.5, color: "#9aabae" }}>客人寄到 service@haiwangzi.xyz 後，系統讀進來就會出現在這裡。</span>
                </div>
              )}
              {threads.map((t) => {
                const sel = t.id === selId;
                const last = t.messages?.[0];
                return (
                  <div key={t.id} onClick={() => setSelId(t.id)} style={threadRow(sel)}>
                    <div style={avatar(t.status)}>{initials(t)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.customerName ?? t.customerEmail}
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9aabae", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(t.lastMessageAt)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#3d5563", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject}</div>
                      {last && <div style={{ fontSize: 11.5, color: "#9aabae", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(last.bodyText ?? "").slice(0, 60)}</div>}
                      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                        {t.bookingId && <span style={chipBook}>＃訂位</span>}
                        <span style={chipStatus(t.status)}><span style={{ width: 6, height: 6, borderRadius: "50%", background: ST[t.status].dot }} />{ST[t.status].label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ===== CONVERSATION ===== */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#f4f8f9" }}>
            {!detail && <div style={{ ...empty, marginTop: 60 }}>← 從左邊選一則對話</div>}
            {detail && (
              <>
                <div style={{ background: "#fff", padding: "12px 20px", borderBottom: "1px solid #e1ebeb", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ ...avatar(detail.status), width: 38, height: 38 }}>{initials(detail)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{detail.customerName ?? detail.customerEmail}</div>
                    <div style={{ fontSize: 12, color: "#9aabae", fontFamily: "monospace" }}>{detail.customerEmail}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={detail.status} onChange={(e) => changeStatus(e.target.value as Status)} style={statusSel}>
                      <option value="WAITING">待回覆</option>
                      <option value="PROCESSING">處理中</option>
                      <option value="CLOSED">已結案</option>
                    </select>
                    <button onClick={deleteThread} title="永久刪除整條對話" style={delBtn}>🗑 刪除</button>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3d5563", marginBottom: 14 }}>{detail.subject}</div>
                  {loadingDetail && <div style={empty}>載入對話…</div>}
                  {detail.messages?.map((m) => {
                    const out = m.direction === "OUTBOUND";
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start", marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: "#9aabae", marginBottom: 4, display: "flex", gap: 8 }}>
                          <span style={{ fontWeight: 600, color: out ? "#c0432a" : "#0e7c8a" }}>{out ? "回信 OUT" : "收信 IN"}</span>
                          <span>{new Date(m.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          {out && <span style={{ color: "#2BA66B" }}>{m.status === "DELIVERED" ? "✓ 已送達" : m.status === "SENT" ? "已寄出" : m.status === "BOUNCED" ? "✗ 退信" : m.status}</span>}
                        </div>
                        <div style={bubble(out)}>
                          <MessageBody text={m.bodyText} html={m.bodyHtml} />
                          {(m.attachments ?? []).map((a, i) => (
                            <div key={i} style={att}>📎 {a.filename}{a.size ? ` · ${Math.round(a.size / 1024)} KB` : ""}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* composer */}
                <div style={{ background: "#fff", borderTop: "1px solid #e1ebeb", padding: "12px 20px" }}>
                  <div style={{ fontSize: 11.5, color: "#7c9296", marginBottom: 7 }}>
                    以 <b style={{ color: "#0a2027" }}>service@haiwangzi.xyz</b> 回覆給 {detail.customerName ?? detail.customerEmail}
                    <span style={{ marginLeft: 8, color: "#9aabae" }}>· Zeabur Email 寄送</span>
                  </div>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="輸入回覆內容…（Ctrl/⌘+Enter 寄出）"
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send(); }}
                    style={composer}
                  />
                  <div style={{ display: "flex", marginTop: 8 }}>
                    <button onClick={send} disabled={sending || !reply.trim()} style={sendBtn(sending || !reply.trim())}>
                      {sending ? "寄送中…" : "寄出回覆 ➤"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div style={toastStyle}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1ed4c2" }} />
          {toast}
        </div>
      )}
    </AdminShell>
  );
}

// ── styles ──
function pollBtn(p: boolean): React.CSSProperties {
  return { border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: p ? "wait" : "pointer", background: p ? "#cdd9d9" : "linear-gradient(135deg,#13b5a6,#0e9aa0)", color: "#fff" };
}
const linkBtn: React.CSSProperties = { border: "none", background: "none", color: "#0e7c8a", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" };
const historyPanel: React.CSSProperties = { position: "absolute", top: "100%", left: 14, zIndex: 20, marginTop: 4, width: 320, background: "#fff", border: "1px solid #dce7ea", borderRadius: 10, boxShadow: "0 8px 24px rgba(8,34,47,.14)", padding: "10px 13px" };
const searchInput: React.CSSProperties = { width: "100%", border: "1px solid #dce7ea", borderRadius: 9, padding: "8px 11px", fontSize: 13, fontFamily: "inherit", background: "#f7fafb", outline: "none" };
const empty: React.CSSProperties = { padding: 24, textAlign: "center", fontSize: 13, color: "#7c9296", lineHeight: 1.7 };
function pill(on: boolean): React.CSSProperties {
  return { fontSize: 12, padding: "5px 11px", borderRadius: 8, border: `1px solid ${on ? "#0a2027" : "#dce7ea"}`, background: on ? "#0a2027" : "#fff", color: on ? "#fff" : "#3d5563", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 };
}
function threadRow(sel: boolean): React.CSSProperties {
  return { display: "flex", gap: 11, padding: "12px 14px", borderBottom: "1px solid #f1f4f6", cursor: "pointer", background: sel ? "#e6f4f4" : undefined, boxShadow: sel ? "inset 3px 0 0 #0e9aa0" : undefined };
}
function avatar(s: Status): React.CSSProperties {
  return { width: 34, height: 34, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", color: "#fff", fontWeight: 600, fontSize: 14, background: s === "WAITING" ? "linear-gradient(135deg,#0E9AA0,#0A6E73)" : s === "PROCESSING" ? "linear-gradient(135deg,#E08A2B,#c2701a)" : "linear-gradient(135deg,#9aa7ae,#7a8890)" };
}
const chipBook: React.CSSProperties = { fontSize: 10.5, padding: "2px 7px", borderRadius: 6, background: "#eaf1f3", color: "#3d5563", fontFamily: "monospace" };
function chipStatus(s: Status): React.CSSProperties {
  return { fontSize: 10.5, padding: "2px 8px", borderRadius: 6, background: ST[s].bg, color: ST[s].fg, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 };
}
const statusSel: React.CSSProperties = { fontSize: 12.5, padding: "6px 11px", borderRadius: 9, border: "1px solid #dce7ea", background: "#fff", color: "#3d5563", fontFamily: "inherit", cursor: "pointer" };
const delBtn: React.CSSProperties = { fontSize: 12.5, padding: "6px 11px", borderRadius: 9, border: "1px solid #f3c6c6", background: "#fff", color: "#c0432a", fontFamily: "inherit", cursor: "pointer", fontWeight: 600 };
function bubble(out: boolean): React.CSSProperties {
  return { background: out ? "#fefbfa" : "#fff", border: `1px solid ${out ? "#f3ddd5" : "#e1ebeb"}`, borderRadius: out ? "13px 4px 13px 13px" : "4px 13px 13px 13px", padding: "12px 15px", fontSize: 13.5, lineHeight: 1.7, color: "#0f2430", maxWidth: 620, boxShadow: "0 1px 3px rgba(8,34,47,.05)" };
}
const att: React.CSSProperties = { display: "inline-block", marginTop: 8, padding: "5px 10px", background: "#f4f8f9", border: "1px solid #e1ebeb", borderRadius: 8, fontSize: 12, color: "#3d5563" };
const composer: React.CSSProperties = { width: "100%", border: "1.5px solid #dce7ea", borderRadius: 11, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.7, fontFamily: "inherit", resize: "vertical", minHeight: 70, outline: "none", color: "#0f2430" };
function sendBtn(disabled: boolean): React.CSSProperties {
  return { marginLeft: "auto", border: "none", borderRadius: 9, padding: "9px 22px", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#cdd9d9" : "linear-gradient(135deg,#FF6B4A,#F5522F)", color: "#fff" };
}
const toastStyle: React.CSSProperties = { position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "#0a2027", color: "#fff", padding: "12px 22px", borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,.3)", zIndex: 99, display: "flex", alignItems: "center", gap: 9 };
