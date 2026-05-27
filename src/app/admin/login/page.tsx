"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminToken } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AdminUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  role: string;
  roles: string[];
  effectiveRoles: string[];
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function verifySecret() {
    if (!secret.trim()) {
      setErr("請輸入密碼");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin-web/auth?secret=${encodeURIComponent(secret)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: { users: AdminUser[] } = await res.json();
      setUsers(data.users);
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function selectUser(user: AdminUser) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin-web/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, lineUserId: user.lineUserId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: { token: string } = await res.json();
      setAdminToken(data.token);
      router.push("/admin/bookings");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function roleBadgeVariant(role: string): "coral" | "ocean" | "muted" {
    if (role === "admin") return "coral";
    if (role === "boss") return "ocean";
    return "muted";
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--color-ocean-deep)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
        style={{
          background: "var(--color-ocean-surface)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <div className="mb-2 text-4xl">🤿</div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-phosphor)" }}
          >
            東北角海王子
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(230,240,255,0.6)" }}>
            管理後台
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "rgba(230,240,255,0.8)" }}
              >
                管理密碼
              </label>
              <Input
                type="password"
                placeholder="請輸入管理密碼"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifySecret()}
                className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)]"
                autoComplete="current-password"
              />
            </div>

            {err && (
              <div
                className="rounded-lg p-3 text-sm"
                style={{
                  background: "rgba(255,123,90,0.15)",
                  color: "var(--color-coral)",
                  border: "1px solid rgba(255,123,90,0.3)",
                }}
              >
                {err}
              </div>
            )}

            <Button
              className="w-full font-semibold"
              style={{
                background: "var(--color-phosphor)",
                color: "var(--color-ocean-deep)",
              }}
              onClick={verifySecret}
              disabled={loading}
            >
              {loading ? "驗證中..." : "驗證"}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p
              className="text-sm font-medium"
              style={{ color: "rgba(230,240,255,0.8)" }}
            >
              請選擇登入身分：
            </p>

            {err && (
              <div
                className="rounded-lg p-3 text-sm"
                style={{
                  background: "rgba(255,123,90,0.15)",
                  color: "var(--color-coral)",
                  border: "1px solid rgba(255,123,90,0.3)",
                }}
              >
                {err}
              </div>
            )}

            <div className="grid gap-2">
              {users.map((u) => (
                <button
                  key={u.lineUserId}
                  type="button"
                  onClick={() => selectUser(u)}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{
                      background: "var(--color-phosphor)",
                      color: "var(--color-ocean-deep)",
                    }}
                  >
                    {(u.realName ?? u.displayName).slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="font-semibold"
                        style={{ color: "#e6f0ff" }}
                      >
                        {u.realName ?? u.displayName}
                      </span>
                      {u.effectiveRoles.map((r) => (
                        <Badge
                          key={r}
                          variant={roleBadgeVariant(r)}
                          className="text-[9px]"
                        >
                          {r}
                        </Badge>
                      ))}
                    </div>
                    {u.realName && (
                      <div
                        className="text-xs"
                        style={{ color: "rgba(230,240,255,0.5)" }}
                      >
                        {u.displayName}
                      </div>
                    )}
                  </div>
                  <div style={{ color: "rgba(230,240,255,0.4)" }}>→</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setStep(1);
                setErr(null);
              }}
              className="w-full text-center text-sm"
              style={{ color: "rgba(230,240,255,0.4)" }}
            >
              ← 重新輸入密碼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
