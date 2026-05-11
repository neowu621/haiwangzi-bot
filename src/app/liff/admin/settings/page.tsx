"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiffShell } from "@/components/shell/LiffShell";
import { APP_VERSION } from "@/lib/version";
import Link from "next/link";

export default function SettingsPage() {
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
