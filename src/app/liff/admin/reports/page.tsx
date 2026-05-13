"use client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";

interface Stats {
  users: { total: number; customers: number; coaches: number; admins: number };
  trips: { total: number; open: number };
  tours: { total: number; open: number };
  bookings: { total: number };
  revenue: { paid: number; booked: number };
  pendingProofs: number;
}

export default function ReportsPage() {
  const liff = useLiff();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    liff
      .fetchWithAuth<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setErr(e.message));
  }, [liff]);

  async function downloadCsv() {
    const res = await fetch(
      "/api/admin/bookings/csv?lineUserId=" + (liff.profile?.userId ?? ""),
    );
    if (!res.ok) return alert("匯出失敗");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <LiffShell title="營運報表" backHref="/liff/admin/dashboard">
      <div className="space-y-4 px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}
        {stats && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">本季摘要</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Row label="已收營收" value={`NT$ ${stats.revenue.paid.toLocaleString()}`} highlight />
                <Row label="預估營收" value={`NT$ ${stats.revenue.booked.toLocaleString()}`} />
                <Row label="總訂單" value={String(stats.bookings.total)} />
                <Row label="待核轉帳" value={String(stats.pendingProofs)} />
                <Row label="日潛場次" value={`${stats.trips.open}/${stats.trips.total}`} />
                <Row label="潛水團" value={`${stats.tours.open}/${stats.tours.total}`} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">會員結構</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-center">
                <Pill label="客戶" value={stats.users.customers} />
                <Pill label="教練" value={stats.users.coaches} />
                <Pill label="Admin" value={stats.users.admins} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">匯出</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={downloadCsv} className="w-full">
                  下載所有訂單 CSV
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </LiffShell>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div
        className={
          "mt-0.5 text-lg font-bold tabular " +
          (highlight ? "text-[var(--color-coral)]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
function Pill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--muted)] p-3">
      <div className="text-2xl font-bold tabular">{value}</div>
      <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
    </div>
  );
}
