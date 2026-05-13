"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { APP_VERSION } from "@/lib/version";
import Link from "next/link";

export default function SettingsPage() {
  const liff = useLiff();
  const [emailTo, setEmailTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await liff.fetchWithAuth<{
        ok: boolean;
        to?: string;
        skipped?: boolean;
        reason?: string;
        error?: string;
        hint?: string;
      }>("/api/admin/email/test", {
        method: "POST",
        body: JSON.stringify(emailTo ? { to: emailTo.trim() } : {}),
      });
      if (r.ok) {
        setTestResult(`✓ 已寄出到 ${r.to}（請檢查收件匣 / 垃圾信）`);
      } else if (r.skipped) {
        setTestResult(`⚠ 略過：${r.reason}`);
      } else {
        setTestResult(`✗ 失敗：${r.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 503 + hint
      setTestResult(`✗ ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <LiffShell title="系統設定" backHref="/liff/admin/dashboard">
      <div className="space-y-4 px-4 pt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系統資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="App 版本" value={APP_VERSION} />
            <Row label="環境" value={process.env.NODE_ENV ?? "—"} />
          </CardContent>
        </Card>

        {/* Email 測試 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email 通道測試</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              寄一封測試信，驗證 Gmail SMTP 是否設定成功。
              <br />
              預設寄給 admin 自己的 email（在
              <code className="mx-1">/liff/profile</code>填的）。
            </p>
            <div>
              <Label className="text-xs">指定收件人 (可選)</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="留空 = 寄給我自己"
              />
            </div>
            <Button
              className="w-full"
              onClick={sendTest}
              disabled={testing}
            >
              {testing ? "寄送中..." : "📧 寄測試信"}
            </Button>
            {testResult && (
              <div
                className={`rounded-md p-2 text-xs ${
                  testResult.startsWith("✓")
                    ? "bg-[var(--color-phosphor)]/15 text-[var(--color-ocean-deep)]"
                    : "bg-[var(--color-coral)]/15 text-[var(--color-coral)]"
                }`}
              >
                {testResult}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">外部設定 (env)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-[var(--muted-foreground)]">
              以下變數必須在 .env / Zeabur 平台設定，本頁面不寫入：
            </p>
            <ul className="space-y-1 font-mono text-xs">
              <li>LINE_CHANNEL_ACCESS_TOKEN</li>
              <li>LINE_CHANNEL_SECRET</li>
              <li>LINE_LIFF_ID</li>
              <li>JWT_SECRET</li>
              <li>R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY</li>
              <li>R2_BUCKET / NEXT_PUBLIC_R2_PUBLIC_BASE</li>
              <li>BANK_NAME / BANK_BRANCH / BANK_ACCOUNT / BANK_HOLDER</li>
              <li className="text-[var(--color-phosphor)]">
                GMAIL_USER / GMAIL_APP_PASSWORD （Email 通知用）
              </li>
              <li>EMAIL_FROM / EMAIL_REPLY_TO (optional)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">維護工具</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link href="/api/healthz" target="_blank">
              <Button variant="outline" className="w-full">
                /api/healthz
              </Button>
            </Link>
            <Link href="/api/dbcheck" target="_blank">
              <Button variant="outline" className="w-full">
                /api/dbcheck
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </LiffShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] py-1.5 last:border-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
