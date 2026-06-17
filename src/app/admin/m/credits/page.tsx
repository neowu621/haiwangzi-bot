"use client";
// 手機簡版後台「抵用金管理」（/admin/m/credits）
//   一次抓 /api/admin/users（含 creditBalance）、客戶端去抖搜尋（姓名 / 電話 / 會員編號）。
//   只渲染前 ~30 筆（reveal-more），避免一次塞上千個 DOM。
//   點一張卡 → 展開「發放/調整抵用金」面板，POST /api/admin/credits（與桌機完整版同 body）。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Search, ExternalLink, Coins, Check } from "lucide-react";

interface MUser {
  lineUserId: string;
  code: string | null;
  displayName: string;
  realName: string | null;
  phone: string | null;
  creditBalance: number;
}
interface UsersResp {
  users: MUser[];
}

const PAGE = 30;

export default function MobileCreditsPage() {
  const { ready } = useAdminAuth();
  const [users, setUsers] = useState<MUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  // 展開中的會員 + 表單狀態
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  // 搜尋去抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // 條件變更 → 回到第一頁
  useEffect(() => {
    setShown(PAGE);
  }, [debouncedQ]);

  // ready 後抓一次完整 user list（含 creditBalance）
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    adminFetch<UsersResp>("/api/admin/users")
      .then((d) => {
        if (alive) setUsers(d.users ?? []);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  const filtered = useMemo(() => {
    if (!debouncedQ) return users;
    return users.filter((u) => {
      const name = (u.realName ?? u.displayName ?? "").toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      const code = (u.code ?? "").toLowerCase();
      return name.includes(debouncedQ) || phone.includes(debouncedQ) || code.includes(debouncedQ);
    });
  }, [users, debouncedQ]);

  const visible = filtered.slice(0, shown);

  function toggle(u: MUser) {
    if (openId === u.lineUserId) {
      setOpenId(null);
      return;
    }
    setOpenId(u.lineUserId);
    setAmount("");
    setNote("");
    setOkMsg(null);
    setFormErr(null);
  }

  const submit = useCallback(
    async (u: MUser) => {
      const amt = parseInt(amount, 10);
      if (!amt || Number.isNaN(amt)) {
        setFormErr("請輸入金額（可為負數扣回）");
        return;
      }
      setSubmitting(true);
      setFormErr(null);
      setOkMsg(null);
      try {
        // 與桌機 /admin/credits 完全相同的 body
        const r = await adminFetch<{ ok: boolean; newBalance: number }>("/api/admin/credits", {
          method: "POST",
          body: JSON.stringify({
            userId: u.lineUserId,
            amount: amt,
            reason: "admin_adjust",
            note: note || null,
            expiryDays: 360,
          }),
        });
        // 更新該會員顯示餘額
        setUsers((prev) =>
          prev.map((x) =>
            x.lineUserId === u.lineUserId ? { ...x, creditBalance: r.newBalance } : x,
          ),
        );
        setOkMsg(`已${amt > 0 ? "發放" : "扣回"} ${Math.abs(amt).toLocaleString()}，餘額 ${r.newBalance.toLocaleString()}`);
        setAmount("");
        setNote("");
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : "送出失敗");
      } finally {
        setSubmitting(false);
      }
    },
    [amount, note],
  );

  return (
    <MobileAdminShell title="抵用金管理" back="/admin/m">
      <div className="mb-3 flex items-center justify-end">
        <Link
          href="/admin/credits"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          完整版 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* 搜尋框 */}
      <div
        className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}
      >
        <Search className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名 / 電話 / 會員編號"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          inputMode="search"
        />
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {/* 會員卡列表 */}
      <div className="space-y-2">
        {visible.map((u) => {
          const open = openId === u.lineUserId;
          return (
            <div
              key={u.lineUserId}
              className="rounded-xl border"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <button
                type="button"
                onClick={() => toggle(u)}
                className="block w-full px-3 py-2.5 text-left active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">
                    {u.realName ?? u.displayName}
                  </span>
                  <span
                    className="flex flex-shrink-0 items-center gap-1 font-mono text-sm font-bold tabular-nums"
                    style={{ color: "var(--color-ocean-deep)" }}
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {u.creditBalance.toLocaleString()}
                  </span>
                </div>
                <div
                  className="mt-0.5 truncate text-[11px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {u.code ? `${u.code}` : "無編號"}
                  {u.phone ? `・${u.phone}` : ""}
                </div>
              </button>

              {/* 發放/調整面板 */}
              {open && (
                <div
                  className="border-t px-3 py-3"
                  style={{ borderColor: "rgba(0,0,0,0.06)" }}
                >
                  <div className="flex gap-2">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="金額（負數=扣回）"
                      inputMode="numeric"
                      className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 font-mono text-sm tabular-nums outline-none"
                      style={{ borderColor: "rgba(0,0,0,0.12)", background: "var(--card, #fff)" }}
                    />
                    <button
                      type="button"
                      onClick={() => submit(u)}
                      disabled={submitting}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "var(--color-ocean-deep)" }}
                    >
                      <Check className="h-4 w-4" />
                      {submitting ? "送出中" : "送出"}
                    </button>
                  </div>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="名義（會顯示給會員，例：客訴補償）"
                    className="mt-2 w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
                    style={{ borderColor: "rgba(0,0,0,0.12)", background: "var(--card, #fff)" }}
                  />

                  {formErr && (
                    <div
                      className="mt-2 rounded-lg px-2.5 py-1.5 text-xs"
                      style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
                    >
                      {formErr}
                    </div>
                  )}
                  {okMsg && (
                    <div
                      className="mt-2 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"
                      style={{ background: "rgba(16,163,74,0.12)", color: "#16a34a" }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {okMsg}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 載入 / 空狀態 / reveal-more */}
      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有符合的會員
        </div>
      )}
      {!loading && shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-3 w-full rounded-xl border py-2.5 text-xs font-medium"
          style={{
            borderColor: "rgba(0,0,0,0.08)",
            background: "var(--card, #fff)",
            color: "var(--muted-foreground)",
          }}
        >
          顯示更多（還有 {filtered.length - shown} 位）
        </button>
      )}
    </MobileAdminShell>
  );
}
