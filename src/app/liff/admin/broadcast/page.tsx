"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { key: "text", label: "純文字" },
  { key: "booking_confirm", label: "預約確認" },
  { key: "d1_reminder", label: "D-1 行前提醒" },
  { key: "deposit_notice", label: "訂金繳費通知" },
  { key: "deposit_confirm", label: "訂金確認" },
  { key: "final_reminder", label: "尾款提醒" },
  { key: "trip_guide", label: "行前手冊" },
  { key: "weather_cancel", label: "天氣取消" },
  { key: "admin_weekly", label: "週報摘要" },
] as const;

const AUDIENCES = [
  { key: "all", label: "全體" },
  { key: "customers", label: "客戶" },
  { key: "coaches", label: "教練" },
  { key: "admins", label: "Admin" },
] as const;

export default function BroadcastPage() {
  const liff = useLiff();
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]["key"]>("customers");
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["key"]>("text");
  const [altText, setAltText] = useState("海王子潛水團通知");
  const [text, setText] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(paramsJson || "{}");
      } catch {
        setResult("params JSON 格式錯誤");
        setSending(false);
        return;
      }
      const res = await liff.fetchWithAuth<{
        ok: boolean;
        delivered: number;
        dryRun?: boolean;
        note?: string;
      }>("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({
          audience,
          template,
          altText,
          text,
          params,
        }),
      });
      setResult(
        res.dryRun
          ? `🧪 Dry-run（${res.note}）— 預估送達 ${res.delivered} 人`
          : `✓ 已送達 ${res.delivered} 人`,
      );
    } catch (e) {
      setResult(`失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <LiffShell title="群發推播" backHref="/liff/admin/dashboard">
      <div className="space-y-4 px-4 pt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. 對象</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  audience === a.key
                    ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                    : "border-[var(--border)]",
                )}
              >
                {a.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. 訊息模板</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    template === t.key
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                      : "border-[var(--border)]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <Label>altText (通知列文字)</Label>
              <Input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
              />
            </div>
            {template === "text" ? (
              <div>
                <Label>純文字內容</Label>
                <textarea
                  className="w-full rounded-[var(--radius-card)] border border-[var(--input)] bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="您要傳給用戶的訊息..."
                />
              </div>
            ) : (
              <div>
                <Label>Flex 參數 (JSON)</Label>
                <textarea
                  className="w-full rounded-[var(--radius-card)] border border-[var(--input)] bg-white p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  rows={6}
                  value={paramsJson}
                  onChange={(e) => setParamsJson(e.target.value)}
                  placeholder='{"name":"張三","date":"2026-05-15","time":"08:00","site":"龍洞灣","total":3500}'
                />
                <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  依模板需要的 key 填入；可參考 src/lib/flex/{template}.ts
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          variant="ocean"
          size="lg"
          className="w-full"
          disabled={sending}
          onClick={send}
        >
          <Send className="h-4 w-4" />
          {sending ? "傳送中..." : "確認發送"}
        </Button>

        {result && (
          <Card
            className={
              result.startsWith("✓")
                ? "bg-[var(--color-phosphor)]/15"
                : "bg-[var(--color-coral)]/15"
            }
          >
            <CardContent className="p-3 text-sm">{result}</CardContent>
          </Card>
        )}
      </div>
    </LiffShell>
  );
}
