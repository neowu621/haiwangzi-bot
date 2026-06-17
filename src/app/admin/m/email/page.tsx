"use client";
// 手機簡版後台「客服信箱」（/admin/m/email）— Email + LINE 統一收件匣。
//   兩段式（手機把桌機三欄折成兩段）：
//     ① 列表：對話卡（來源 chip ✉️/💬、姓名/主旨、最後一句摘要、時間、狀態）。
//     ② 對話：聊天泡泡（收信靠左 / 回信靠右）+ 底部回覆框。
//   回覆走桌機同一支 /reply（body { html, text }）→ LINE 對話自動用 LINE 推送，Email 對話寄 email。
//   手機顧流量：列表只抓 status=WAITING(待回覆)外加全部過濾、開對話才抓完整 messages；
//   訊息只渲染純文字 bodyText（不跑 iframe / 不渲染未消毒 HTML），最省、最安全。
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { ExternalLink, ChevronLeft, Send } from "lucide-react";

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
}
interface Thread {
  id: string;
  subject: string;
  customerEmail: string;
  customerName?: string | null;
  channel?: string; // email / line
  status: Status;
  tags: string[];
  bookingId?: string | null;
  lastMessageAt: string;
  messages: Msg[];
}

const STATUS_META: Record<Status, { label: string; dot: string; fg: string }> = {
  WAITING: { label: "待回覆", dot: "#FF6B4A", fg: "#c0432a" },
  PROCESSING: { label: "處理中", dot: "#E08A2B", fg: "#a9701b" },
  CLOSED: { label: "已結案", dot: "#2BA66B", fg: "#1c8f5e" },
};

const STATUS_CHIPS: Array<{ key: string; label: string }> = [
  { key: "", label: "全部" },
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
function fmtFull(d: string) {
  return new Date(d).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 一句摘要：取訊息純文字第一行（壓掉換行），給列表卡用
function snippet(t: Thread): string {
  const m = t.messages?.[0];
  const raw = (m?.bodyText ?? "").replace(/\s+/g, " ").trim();
  return raw || (m?.bodyHtml ? "(HTML 內容，請開啟查看)" : "(無內容)");
}

// 桌機同款：把回覆純文字轉成安全 HTML（跳脫 + URL 連結 + 每行一段）
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function linkifyHtml(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
}

export default function MobileEmailPage() {
  const { ready } = useAdminAuth();

  // 列表狀態
  const [status, setStatus] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 對話狀態（in-page，不導頁）
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Thread | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 回覆
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 列表載入（status 變更 → 重抓；手機輕量，後端固定 take 30）
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoadingList(true);
    setListError(null);
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    adminFetch<{ threads: Thread[] }>(`/api/admin/email/threads?${p.toString()}`)
      .then((d) => {
        if (alive) setThreads(d.threads);
      })
      .catch((e) => {
        if (alive) setListError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoadingList(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, status]);

  // 開對話 → 抓完整 messages
  const openThread = useCallback((id: string) => {
    setOpenId(id);
    setDetail(null);
    setReply("");
    setSendError(null);
    setLoadingDetail(true);
    setDetailError(null);
    adminFetch<{ thread: Thread }>(`/api/admin/email/threads/${id}`)
      .then((d) => setDetail(d.thread))
      .catch((e) => setDetailError(e instanceof Error ? e.message : "載入對話失敗"))
      .finally(() => setLoadingDetail(false));
  }, []);

  // 對話載入後捲到底（看最新訊息）
  useEffect(() => {
    if (detail && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail]);

  function backToList() {
    setOpenId(null);
    setDetail(null);
    setReply("");
    setSendError(null);
  }

  // 送出回覆 — 桌機同一支 /reply、同一組 body { html, text }
  async function send() {
    if (!detail || !reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const textVal = reply;
    try {
      const html = textVal
        .split("\n")
        .map((l) => `<p>${linkifyHtml(esc(l)) || "&nbsp;"}</p>`)
        .join("");
      const res = await adminFetch<{ ok: boolean; messageId: string }>(
        `/api/admin/email/threads/${detail.id}/reply`,
        { method: "POST", body: JSON.stringify({ html, text: textVal }) },
      );
      // 樂觀附上一則 OUTBOUND，更新可見歷史 + 清空輸入框
      const now = new Date().toISOString();
      const out: Msg = {
        id: res.messageId ?? `local-${Date.now()}`,
        direction: "OUTBOUND",
        fromAddr: detail.channel === "line" ? "line-oa" : "service@haiwangzi.xyz",
        toAddr: detail.channel === "line" ? detail.customerEmail : detail.customerEmail,
        subject: detail.subject,
        bodyText: textVal,
        bodyHtml: null,
        status: "SENT",
        createdAt: now,
      };
      setDetail((cur) =>
        cur ? { ...cur, messages: [...(cur.messages ?? []), out], status: "PROCESSING" } : cur,
      );
      // 列表同步：把這串移到處理中、更新時間
      setThreads((arr) =>
        arr.map((t) =>
          t.id === detail.id
            ? { ...t, status: "PROCESSING", lastMessageAt: now, messages: [out] }
            : t,
        ),
      );
      setReply("");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSending(false);
    }
  }

  // ───────── 對話視圖 ─────────
  if (openId) {
    const isLine = detail?.channel === "line";
    return (
      <MobileAdminShell title="客服信箱" back="/admin/m">
        <div className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* 回列表（in-page，與外殼的『首頁』分開） */}
          <button
            type="button"
            onClick={backToList}
            className="mb-2 flex items-center gap-0.5 self-start rounded-lg px-1 py-1 text-xs font-medium active:scale-95"
            style={{ color: "var(--color-ocean-deep)" }}
          >
            <ChevronLeft className="h-4 w-4" />
            列表
          </button>

          {/* 對話標頭 */}
          {detail && (
            <div
              className="mb-2 rounded-xl border px-3 py-2.5"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" title={isLine ? "LINE" : "Email"}>
                  {isLine ? "💬" : "✉️"}
                </span>
                <span className="truncate text-sm font-bold">
                  {detail.customerName ?? detail.customerEmail}
                </span>
                <span
                  className="ml-auto flex flex-shrink-0 items-center gap-1 text-[11px]"
                  style={{ color: STATUS_META[detail.status].fg }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_META[detail.status].dot }}
                  />
                  {STATUS_META[detail.status].label}
                </span>
              </div>
              <div
                className="mt-0.5 truncate text-[11px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {detail.subject}
              </div>
            </div>
          )}

          {/* 訊息歷史 */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto">
            {loadingDetail && (
              <div
                className="py-6 text-center text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                載入對話中...
              </div>
            )}
            {detailError && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
              >
                載入對話失敗：{detailError}
              </div>
            )}
            {detail?.messages?.map((m) => {
              const out = m.direction === "OUTBOUND";
              return (
                <div
                  key={m.id}
                  className="flex flex-col"
                  style={{ alignItems: out ? "flex-end" : "flex-start" }}
                >
                  <div
                    className="mb-1 flex items-center gap-1.5 text-[10px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: out ? "var(--color-coral)" : "var(--color-ocean-deep)" }}
                    >
                      {out ? "回覆" : "收到"}
                    </span>
                    <span>{fmtFull(m.createdAt)}</span>
                  </div>
                  <div
                    className="max-w-[82%] whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-[13px] leading-relaxed"
                    style={{
                      background: out ? "rgba(255,107,107,0.06)" : "var(--card, #fff)",
                      borderColor: out ? "rgba(255,107,107,0.25)" : "rgba(0,0,0,0.08)",
                      color: "var(--foreground)",
                    }}
                  >
                    {(m.bodyText && m.bodyText.trim())
                      ? m.bodyText
                      : m.bodyHtml
                        ? "(此訊息為 HTML 內容，請至完整版查看)"
                        : "(無內容)"}
                  </div>
                </div>
              );
            })}
            {detail && !loadingDetail && (detail.messages?.length ?? 0) === 0 && (
              <div
                className="py-6 text-center text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                這串還沒有訊息
              </div>
            )}
          </div>

          {/* 回覆框 */}
          {detail && (
            <div
              className="mt-2 rounded-xl border px-3 py-2.5"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="mb-1.5 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {isLine ? (
                  <>
                    以 <b style={{ color: "#06a34a" }}>LINE 官方帳號</b> 回覆
                    {detail.customerName ? `給 ${detail.customerName}` : ""}
                  </>
                ) : (
                  <>
                    以 <b style={{ color: "var(--color-ocean-deep)" }}>service@haiwangzi.xyz</b>{" "}
                    回覆給 {detail.customerName ?? detail.customerEmail}
                  </>
                )}
              </div>
              {sendError && (
                <div
                  className="mb-1.5 rounded-lg px-2 py-1.5 text-[11px]"
                  style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
                >
                  {sendError}
                </div>
              )}
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="輸入回覆內容…"
                rows={3}
                className="w-full resize-y rounded-lg border bg-transparent px-2.5 py-2 text-[13px] leading-relaxed outline-none"
                style={{ borderColor: "rgba(0,0,0,0.12)" }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !reply.trim()}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50"
                  style={{ background: "var(--color-coral)" }}
                >
                  <Send className="h-4 w-4" />
                  {sending ? "送出中…" : "送出"}
                </button>
              </div>
            </div>
          )}
        </div>
      </MobileAdminShell>
    );
  }

  // ───────── 列表視圖 ─────────
  return (
    <MobileAdminShell title="客服信箱" back="/admin/m">
      <div className="mb-3 flex items-center justify-end">
        <Link
          href="/admin/email"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          完整版 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* 狀態 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((c) => {
          const active = status === c.key;
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
            </button>
          );
        })}
      </div>

      {listError && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{listError}
        </div>
      )}

      {/* 對話列表 */}
      <div className="space-y-2">
        {threads.map((t) => {
          const isLine = t.channel === "line";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className="block w-full rounded-xl border px-3 py-2.5 text-left active:scale-[0.99]"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 text-sm" title={isLine ? "LINE" : "Email"}>
                  {isLine ? "💬" : "✉️"}
                </span>
                <span className="truncate text-sm font-bold">
                  {t.customerName ?? t.customerEmail}
                </span>
                <span
                  className="ml-auto flex-shrink-0 text-[10px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {fmt(t.lastMessageAt)}
                </span>
              </div>
              <div
                className="mt-0.5 truncate text-[11px] font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {t.subject}
              </div>
              <div
                className="mt-0.5 truncate text-[11px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {snippet(t)}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STATUS_META[t.status].dot }}
                />
                <span className="text-[11px] font-medium" style={{ color: STATUS_META[t.status].fg }}>
                  {STATUS_META[t.status].label}
                </span>
                {t.bookingId && (
                  <span
                    className="ml-1 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                    title="有訂位"
                  >
                    ＃訂位
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 載入 / 空狀態 */}
      {loadingList && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
      {!loadingList && threads.length === 0 && !listError && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          目前沒有信件
        </div>
      )}
    </MobileAdminShell>
  );
}
