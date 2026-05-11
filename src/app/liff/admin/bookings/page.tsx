"use client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";

interface AdminBooking {
  id: string;
  type: "daily" | "tour";
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  participants: number;
  createdAt: string;
  user: { displayName: string; realName: string | null; phone: string | null };
}

export default function AdminBookingsPage() {
  const liff = useLiff();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    liff
      .fetchWithAuth<{ bookings: AdminBooking[] }>("/api/admin/bookings")
      .then((d) => setBookings(d.bookings))
      .catch((e) => setErr(e.message));
  }, [liff]);

  const all = bookings;
  const upcoming = bookings.filter(
    (b) => b.status === "pending" || b.status === "confirmed",
  );
  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) => b.status.startsWith("cancelled"));

  async function exportCsv() {
    const res = await fetch("/api/admin/bookings/csv?lineUserId=" + (liff.profile?.userId ?? ""));
    if (!res.ok) {
      alert("匯出失敗：" + (await res.text()));
      return;
    }
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
    <LiffShell
      title="訂單管理"
      backHref="/liff/admin/dashboard"
      rightSlot={
        <Button size="sm" variant="outline" onClick={exportCsv}>
          匯出 CSV
        </Button>
      }
    >
      <div className="px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}
        <Tabs defaultValue="all">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">全部 ({all.length})</TabsTrigger>
            <TabsTrigger value="up">進行中 ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="done">完成 ({completed.length})</TabsTrigger>
            <TabsTrigger value="cancel">取消 ({cancelled.length})</TabsTrigger>
          </TabsList>
          {(
            [
              ["all", all],
              ["up", upcoming],
              ["done", completed],
              ["cancel", cancelled],
            ] as const
          ).map(([v, list]) => (
            <TabsContent key={v} value={v} className="space-y-2">
              {list.map((b) => (
                <Card key={b.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold">
                          {b.user.realName ?? b.user.displayName}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] tabular">
                          {b.user.phone ?? "—"} · {new Date(b.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={b.type === "tour" ? "coral" : "muted"}>
                          {b.type === "tour" ? "旅行團" : "日潛"}
                        </Badge>
                        <div className="mt-1 text-xs tabular">
                          {b.paidAmount.toLocaleString()}/{b.totalAmount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="ocean">{b.status}</Badge>
                      <Badge variant="muted">{b.paymentStatus}</Badge>
                      <span className="text-[10px] text-[var(--muted-foreground)] tabular">×{b.participants}人</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {list.length === 0 && (
                <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  無資料
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </LiffShell>
  );
}
