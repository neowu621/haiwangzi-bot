"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Plane,
  TrendingUp,
  AlertCircle,
  Settings,
  Send,
  FileText,
  CalendarPlus,
  MessageSquareText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function AdminDashboardPage() {
  const liff = useLiff();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    liff
      .fetchWithAuth<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setErr(e.message));
  }, [liff]);

  return (
    <LiffShell title="Admin 主控台" backHref="/liff/welcome">
      <div className="space-y-3 px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">
            {err}
            <div className="mt-2 text-xs text-[var(--muted-foreground)]">
              提示：將自己的 LINE userId 在資料庫 users 表的 role 設為 admin
            </div>
          </Card>
        )}
        {stats && (
          <>
            <Card className="bg-[var(--color-ocean-deep)] text-white">
              <CardContent className="p-4">
                <div className="text-xs opacity-70">本季營收</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-3xl font-bold tabular text-[var(--color-phosphor)]">
                    NT$ {stats.revenue.paid.toLocaleString()}
                  </div>
                  <div className="pb-1 text-xs opacity-70 tabular">
                    /預估 {stats.revenue.booked.toLocaleString()}
                  </div>
                </div>
                {stats.pendingProofs > 0 && (
                  <Link href="/liff/coach/payment">
                    <div className="mt-3 flex items-center gap-1 rounded-lg bg-[var(--color-gold)] px-3 py-2 text-xs font-bold text-[var(--color-ocean-deep)]">
                      <AlertCircle className="h-3 w-3" />
                      {stats.pendingProofs} 筆轉帳待核對 →
                    </div>
                  </Link>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Mini
                Icon={Users}
                label="會員"
                value={stats.users.total}
                desc={`客 ${stats.users.customers} · 教 ${stats.users.coaches}`}
              />
              <Mini
                Icon={Calendar}
                label="日潛場次"
                value={stats.trips.total}
                desc={`開放 ${stats.trips.open}`}
              />
              <Mini
                Icon={Plane}
                label="旅行團"
                value={stats.tours.total}
                desc={`開放 ${stats.tours.open}`}
              />
              <Mini
                Icon={TrendingUp}
                label="總訂單"
                value={stats.bookings.total}
                desc="累計"
              />
            </div>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">管理工具</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <AdminLink href="/liff/admin/trips" Icon={CalendarPlus} label="開團管理" />
            <AdminLink href="/liff/admin/bookings" Icon={FileText} label="訂單管理" />
            <AdminLink href="/liff/admin/users" Icon={Users} label="會員管理" />
            <AdminLink href="/liff/admin/broadcast" Icon={Send} label="群發推播" />
            <AdminLink href="/liff/admin/templates" Icon={MessageSquareText} label="訊息模板" />
            <AdminLink href="/liff/admin/reports" Icon={TrendingUp} label="營運報表" />
            <AdminLink href="/liff/admin/settings" Icon={Settings} label="系統設定" />
            <AdminLink href="/liff/coach/payment" Icon={AlertCircle} label="收款核對" />
          </CardContent>
        </Card>
      </div>
    </LiffShell>
  );
}

function Mini({
  Icon,
  label,
  value,
  desc,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular">{value}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{desc}</div>
      </CardContent>
    </Card>
  );
}

function AdminLink({
  href,
  Icon,
  label,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] p-3 text-sm font-medium hover:bg-[var(--muted)]"
    >
      <Icon className="h-4 w-4 text-[var(--color-phosphor)]" />
      {label}
    </Link>
  );
}
