"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminToken, setAdminUser } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION } from "@/lib/version";

interface AdminUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  role: string;
  roles: string[];
  effectiveRoles: string[];
  hasPassword: boolean;
}

type Step = "secret" | "pick" | "password" | "set-password";

/* ── 樣式輔助 ─────────────────────────────── */
function badgeVariant(role: string): "coral" | "ocean" | "muted" {
  if (role === "admin") return "coral";
  if (role === "boss") return "ocean";
  return "muted";
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const labelStyle: React.CSSProperties = { color: "rgba(230,240,255,0.8)" };
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };
const errBoxStyle: React.CSSProperties = {
  background: "rgba(255,123,90,0.15)",
  color: "var(--color-coral)",
  border: "1px solid rgba(255,123,90,0.3)",
};
const inputCls =
  "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)]";
const primaryBtn: React.CSSProperties = {
  background: "var(--color-phosphor)",
  color: "var(--color-ocean-deep)",
};

/* ── 主元件 ───────────────────────────────── */
export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("secret");
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* Step 1：驗共用管理密碼 */
  async function verifySecret() {
    if (!secret.trim()) { setErr("請輸入管理密碼"); return; }
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/admin-web/auth?secret=${encodeURIComponent(secret)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUsers(data.users);
      setStep("pick");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /* Step 2：選身分 → 判斷跳哪個 Step */
  function pickUser(u: AdminUser) {
    setSelectedUser(u);
    setPassword("");
    setNewPwd("");
    setConfirmPwd("");
    setErr(null);
    if (u.hasPassword) {
      setStep("password");
    } else {
      setStep("set-password");
    }
  }

  /* Step 3a：輸入個人密碼 → 取得 JWT */
  async function loginWithPassword() {
    if (!password) { setErr("請輸入密碼"); return; }
    if (!selectedUser) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/admin-web/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, lineUserId: selectedUser.lineUserId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAdminToken(data.token);
      setAdminUser({
        lineUserId: data.user.lineUserId,
        displayName: data.user.displayName,
        realName: data.user.realName,
        effectiveRoles: data.user.effectiveRoles,
      });
      router.push("/admin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /* Step 3b：首次設定個人密碼（或忘記密碼重設） */
  async function setPassword_() {
    if (!newPwd || !confirmPwd) { setErr("請填寫新密碼與確認密碼"); return; }
    if (newPwd.length < 8) { setErr("密碼至少 8 個字元"); return; }
    if (newPwd !== confirmPwd) { setErr("兩次輸入不一致"); return; }
    if (!selectedUser) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/admin-web/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          lineUserId: selectedUser.lineUserId,
          newPassword: newPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // 設完密碼後直接自動登入
      const loginRes = await fetch("/api/admin-web/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          lineUserId: selectedUser.lineUserId,
          password: newPwd,
        }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.error ?? `HTTP ${loginRes.status}`);
      setAdminToken(loginData.token);
      setAdminUser({
        lineUserId: loginData.user.lineUserId,
        displayName: loginData.user.displayName,
        realName: loginData.user.realName,
        effectiveRoles: loginData.user.effectiveRoles,
      });
      router.push("/admin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ── 步驟指示器 ───────────────────────────── */
  const STEPS = ["管理密碼", "選擇身分", "個人密碼"];
  const stepIdx = step === "secret" ? 0 : step === "pick" ? 1 : 2;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--color-ocean-deep)" }}
    >
      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl" style={cardStyle}>
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🤿</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-phosphor)" }}>
            東北角海王子
          </h1>
          <p className="mt-1 text-sm" style={subStyle}>
            管理後台{" "}
            <span className="rounded px-1.5 py-0.5 text-[10px] font-mono"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(230,240,255,0.45)" }}>
              v{APP_VERSION}
            </span>
          </p>
        </div>

        {/* 步驟進度條 */}
        <div className="mb-6 flex items-center justify-center gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors"
                style={
                  i < stepIdx
                    ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }
                    : i === stepIdx
                    ? { background: "rgba(255,255,255,0.2)", color: "#fff" }
                    : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }
                }
              >
                {i < stepIdx ? "✓" : i + 1}
              </div>
              <span
                className="text-[10px]"
                style={{ color: i === stepIdx ? "rgba(230,240,255,0.8)" : "rgba(230,240,255,0.3)" }}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-px w-4" style={{ background: "rgba(255,255,255,0.15)" }} />
              )}
            </div>
          ))}
        </div>

        {/* 錯誤訊息 */}
        {err && (
          <div className="mb-4 rounded-lg p-3 text-sm" style={errBoxStyle}>{err}</div>
        )}

        {/* ── Step 1：管理密碼 ── */}
        {step === "secret" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>
                管理密碼
              </label>
              <Input
                type="password"
                placeholder="請輸入管理密碼"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifySecret()}
                className={inputCls}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <Button
              className="w-full font-semibold"
              style={primaryBtn}
              onClick={verifySecret}
              disabled={loading}
            >
              {loading ? "驗證中..." : "下一步"}
            </Button>
          </div>
        )}

        {/* ── Step 2：選身分 ── */}
        {step === "pick" && (
          <div className="space-y-3">
            <p className="text-sm font-medium" style={labelStyle}>請選擇你的帳號：</p>
            <div className="grid gap-2">
              {users.map((u) => (
                <button
                  key={u.lineUserId}
                  type="button"
                  onClick={() => pickUser(u)}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                  >
                    {(u.realName ?? u.displayName).slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold" style={{ color: "#e6f0ff" }}>
                        {u.realName ?? u.displayName}
                      </span>
                      {u.effectiveRoles.map((r) => (
                        <Badge key={r} variant={badgeVariant(r)} className="text-[9px]">{r}</Badge>
                      ))}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={subStyle}>
                      {u.hasPassword ? "🔒 已設定個人密碼" : "⚠️ 尚未設定個人密碼（首次登入）"}
                    </div>
                  </div>
                  <span style={{ color: "rgba(230,240,255,0.4)" }}>→</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setStep("secret"); setErr(null); }}
              className="w-full text-center text-sm" style={subStyle}>
              ← 重新輸入管理密碼
            </button>
          </div>
        )}

        {/* ── Step 3a：輸入個人密碼 ── */}
        {step === "password" && selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                {(selectedUser.realName ?? selectedUser.displayName).slice(0, 1)}
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#e6f0ff" }}>
                  {selectedUser.realName ?? selectedUser.displayName}
                </div>
                <div className="text-[10px]" style={subStyle}>
                  {selectedUser.effectiveRoles.join(", ")}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>
                個人密碼
              </label>
              <Input
                type="password"
                placeholder="請輸入你的個人密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginWithPassword()}
                className={inputCls}
                autoFocus
              />
            </div>
            <Button className="w-full font-semibold" style={primaryBtn}
              onClick={loginWithPassword} disabled={loading}>
              {loading ? "登入中..." : "登入"}
            </Button>
            <button type="button"
              onClick={() => { setStep("set-password"); setPassword(""); setErr(null); }}
              className="w-full text-center text-sm" style={subStyle}>
              忘記密碼？用管理密碼重設
            </button>
            <button type="button" onClick={() => { setStep("pick"); setErr(null); }}
              className="w-full text-center text-sm" style={subStyle}>
              ← 換帳號
            </button>
          </div>
        )}

        {/* ── Step 3b：設定 / 重設個人密碼 ── */}
        {step === "set-password" && selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                {(selectedUser.realName ?? selectedUser.displayName).slice(0, 1)}
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#e6f0ff" }}>
                  {selectedUser.realName ?? selectedUser.displayName}
                </div>
                <div className="text-[10px]" style={{ color: "var(--color-phosphor)" }}>
                  {selectedUser.hasPassword ? "🔄 重設個人密碼" : "🆕 首次設定個人密碼"}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>
                新密碼（至少 8 字元）
              </label>
              <Input
                type="password"
                placeholder="設定你的個人密碼"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>
                確認新密碼
              </label>
              <Input
                type="password"
                placeholder="再輸入一次"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setPassword_()}
                className={inputCls}
              />
            </div>
            <Button className="w-full font-semibold" style={primaryBtn}
              onClick={setPassword_} disabled={loading}>
              {loading ? "設定中..." : selectedUser.hasPassword ? "重設密碼並登入" : "設定密碼並登入"}
            </Button>
            <button type="button" onClick={() => {
              setStep(selectedUser.hasPassword ? "password" : "pick");
              setErr(null);
            }} className="w-full text-center text-sm" style={subStyle}>
              ← 返回
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
