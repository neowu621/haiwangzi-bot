"use client";
import { useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, AlertTriangle } from "lucide-react";

type Audience = "all" | "customers" | "coaches" | "admins";
type Channel = "line" | "email" | "both";

const AUDIENCE_LABELS: Record<Audience, string> = { all: "全部", customers: "客戶", coaches: "教練", admins: "管理員" };
const CHANNEL_LABELS: Record<Channel, string> = { line: "LINE", email: "Email", both: "LINE + Email" };

const TEMPLATES = [
  { key: "text", label: "純文字" },
  { key: "booking_confirm", label: "預約確認" },
  { key: "d1_reminder", label: "明日提醒" },
  { key: "deposit_notice", label: "訂金通知" },
  { key: "final_payment_notice", label: "尾款通知" },
  { key: "tour_guide", label: "行前說明" },
  { key: "weather_cancel", label: "天氣取消" },
  { key: "vip_upgrade", label: "VIP 升等" },
  { key: "birthday_credit", label: "生日禮金" },
];

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

export default function BroadcastPage() {
  const [audience, setAudience] = useState<Audience>("customers");
  const [channel, setChannel] = useState<Channel>("line");
  const [template, setTemplate] = useState("text");
  const [altText, setAltText] = useState("");
  const [textMsg, setTextMsg] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!altText && template !== "text") { setErr("請填寫 altText"); return; }
    if (template === "text" && !textMsg) { setErr("請填寫訊息內容"); return; }
    setSending(true); setErr(null); setResult(null);
    try {
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(paramsJson); } catch { setErr("params JSON 格式錯誤"); setSending(false); return; }
      const body: Record<string, unknown> = { audience, channel, template, altText: altText || textMsg, params };
      if (template === "text") body.text = textMsg;
      if (channel === "email" || channel === "both") {
        body.emailSubject = emailSubject;
        body.emailBody = emailBody;
      }
      const data = await adminFetch<{ ok: boolean; delivered?: number; emailed?: number; dryRun?: boolean; note?: string }>("/api/admin/broadcast", { method: "POST", body: JSON.stringify(body) });
      const parts: string[] = [];
      if ((data.delivered ?? 0) > 0) parts.push(`LINE ${data.delivered} 筆`);
      if ((data.emailed ?? 0) > 0) parts.push(`Email ${data.emailed} 筆`);
      const summary = parts.length > 0 ? parts.join("、") + " 已發送" : "發送完成（0 筆）";
      setResult(data.dryRun ? `${summary}（dry-run：${data.note ?? "env 未設定"}）` : summary);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl space-y-5">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
        {result && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {result}</div>}

        <div className="rounded-lg p-4 text-sm" style={{ background: "rgba(255,200,100,0.1)", border: "1px solid rgba(255,200,100,0.25)", color: "#fbbf24" }}>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          此操作會向真實用戶發送 LINE / Email 訊息，請確認內容後再送出。
        </div>

        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: "var(--border)" }}>
          {/* Audience */}
          <div>
            <Label className="mb-2 block text-sm text-[var(--foreground)]">發送對象</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map(a => (
                <button key={a} onClick={() => setAudience(a)}
                  className="rounded-full px-3 py-1.5 text-sm transition-colors"
                  style={audience === a ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                    : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  {AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {/* Channel */}
          <div>
            <Label className="mb-2 block text-sm text-[var(--foreground)]">發送管道</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CHANNEL_LABELS) as Channel[]).map(c => (
                <button key={c} onClick={() => setChannel(c)}
                  className="rounded-full px-3 py-1.5 text-sm transition-colors"
                  style={channel === c ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                    : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Template */}
          <div>
            <Label className="mb-2 block text-sm text-[var(--foreground)]">訊息模板</Label>
            <select value={template} onChange={e => setTemplate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {/* Text message */}
          {template === "text" ? (
            <div>
              <Label className="mb-2 block text-sm text-[var(--foreground)]">訊息內容</Label>
              <textarea value={textMsg} onChange={e => setTextMsg(e.target.value)} rows={5}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none text-[var(--foreground)]"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
                placeholder="輸入純文字訊息內容..." />
            </div>
          ) : (
            <>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Alt Text（LINE 通知文字）</Label>
                <Input value={altText} onChange={e => setAltText(e.target.value)} placeholder="簡短說明訊息內容" />
              </div>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">模板參數（JSON）</Label>
                <textarea value={paramsJson} onChange={e => setParamsJson(e.target.value)} rows={4}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-none text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  placeholder='{"tripDate": "2026-06-01", "siteName": "龍洞"}' />
              </div>
            </>
          )}

          {/* Email fields */}
          {(channel === "email" || channel === "both") && (
            <>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Email 主旨</Label>
                <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email 標題" />
              </div>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Email 內文</Label>
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  placeholder="Email 正文內容..." />
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button style={primaryBtn} onClick={send} disabled={sending}>
              <Send className="mr-2 h-4 w-4" />
              {sending ? "發送中..." : "確認發送"}
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
