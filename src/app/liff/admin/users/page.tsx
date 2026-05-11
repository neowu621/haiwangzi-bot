"use client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface AdminUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  role: "customer" | "coach" | "admin";
  cert: string | null;
  logCount: number;
  lastActiveAt: string;
}

export default function AdminUsersPage() {
  const liff = useLiff();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    try {
      const d = await liff.fetchWithAuth<{ users: AdminUser[] }>(
        "/api/admin/users",
      );
      setUsers(d.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
  }, [liff]);

  async function setRole(u: AdminUser, role: AdminUser["role"]) {
    setUpdating(u.lineUserId);
    try {
      await liff.fetchWithAuth("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ lineUserId: u.lineUserId, role }),
      });
      setUsers((arr) =>
        arr.map((x) => (x.lineUserId === u.lineUserId ? { ...x, role } : x)),
      );
    } catch (e) {
      alert("失敗: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <LiffShell title="會員管理" backHref="/liff/admin/dashboard">
      <div className="space-y-2 px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}
        {users.map((u) => (
          <Card key={u.lineUserId}>
            <CardContent className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {(u.realName ?? u.displayName).slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {u.realName ?? u.displayName}
                  </span>
                  {u.cert && (
                    <Badge variant="muted" className="text-[10px]">
                      {u.cert}
                    </Badge>
                  )}
                </div>
                <div className="tabular text-[11px] text-[var(--muted-foreground)]">
                  {u.phone ?? "—"} · {u.logCount} logs · 最近 {new Date(u.lastActiveAt).toLocaleDateString("zh-TW")}
                </div>
              </div>
              <div className="flex gap-1">
                {(["customer", "coach", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    disabled={updating === u.lineUserId}
                    onClick={() => setRole(u, r)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      u.role === r
                        ? "bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </LiffShell>
  );
}
