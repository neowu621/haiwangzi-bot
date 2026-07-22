"use client";
// 手機簡版後台「快速群發」（/admin/m/broadcast）
//   沿用現有 POST /api/admin/broadcast（不新建端點）。
//   收件對象（全部/僅客戶/僅教練）+ 通道（LINE/Email/兩者）+ 文字 → 送出。
//   送出帶 template:"text", text, altText（文字前 N 字）, audience, channel。
//   複雜模板 / 三欄式引導回 /admin/broadcast。
import { useState } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Send } from "lucide-react";

type Audience = "all" | "customers" | "coaches";
// v889：新增「站內」通道。ChannelKey 為 UI 單選鍵，送出時映射成 channels[] 陣列。
type ChannelKey = "line" | "email" | "inapp" | "all";

interface BroadcastResult {
  ok: boolean;
  delivered: number;
  emailed: number;
  inapp?: number;
  dryRun?: boolean;
  note?: string;
  channel: string;
}

const AUDIENCES: Array<{ key: Audience; label: string }> = [
  { key: "all", label: "全部" },
  { key: "customers", label: "僅客戶" },
  { key: "coaches", label: "僅教練" },
];
const CHANNELS: Array<{ key: ChannelKey; label: string }> = [
  { key: "line", label: "LINE" },
  { key: "email", label: "Email" },
  { key: "inapp", label: "站內" },
  { key: "all", label: "全部" },
];
// UI 單選鍵 → 後端 channels[] 陣列
const CHANNEL_MAP: Record<ChannelKey, Array<"line" | "email" | "inapp">> = {
  line: ["line"],
  email: ["email"],
  inapp: ["inapp"],
  all: ["line", "email", "inapp"],
};

export default function MobileBroadcastPage() {
  const { ready } = useAdminAuth();
  const [audience, setAudience] = useState<Audience>("all");
  const [channel, setChannel] = useState<ChannelKey>("line");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  async function send() {
    const body = text.trim();
    if (!body) {
      setError("請輸入訊息內容");
      return;
    }
    if (!window.confirm(`確定發送給「${AUDIENCES.find((a) => a.key === audience)?.label}」？`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const altText = body.slice(0, 40);
      const r = await adminFetch<BroadcastResult>("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({
          audience,
          channels: CHANNEL_MAP[channel],
          template: "text",
          text: body,
          altText,
        }),
      });
      setResult(r);
      if (r.ok) setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <MobileAdminShell>{null}</MobileAdminShell>;

  return (
    <MobileAdminShell>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-bold">📣 快速群發</h1>
      </div>

      {/* 收件對象 */}
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          收件對象
        </div>
        <div className="flex gap-1.5">
          {AUDIENCES.map((a) => {
            const active = audience === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAudience(a.key)}
                className="flex-1 rounded-lg py-2 text-xs font-medium transition-colors"
                style={{
                  background: active ? "var(--color-ocean-deep)" : "rgba(0,0,0,0.05)",
                  color: active ? "#fff" : "var(--foreground)",
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 通道 */}
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          通道
        </div>
        <div className="flex gap-1.5">
          {CHANNELS.map((c) => {
            const active = channel === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setChannel(c.key)}
                className="flex-1 rounded-lg py-2 text-xs font-medium transition-colors"
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
      </div>

      {/* 文字 */}
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          訊息內容
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="輸入要群發的文字訊息…"
          className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}
        />
        <div className="mt-1 text-right text-[10px]" style={{ color: "var(--muted-foreground)" }}>
          {text.length} 字
        </div>
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(0,217,203,0.12)", color: "var(--color-ocean-deep)" }}
        >
          {result.dryRun ? "⚠ Dry-run（部分通道未設定）：" : "✅ 已送出："}
          LINE {result.delivered} 筆・Email {result.emailed} 筆・站內 {result.inapp ?? 0} 筆
          {result.note ? `（${result.note}）` : ""}
        </div>
      )}

      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-50"
        style={{ background: "var(--color-coral)", color: "#fff" }}
      >
        <Send className="h-4 w-4" />
        {sending ? "送出中…" : "送出群發"}
      </button>
    </MobileAdminShell>
  );
}
