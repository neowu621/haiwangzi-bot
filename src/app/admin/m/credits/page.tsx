"use client";
// 手機簡版後台「抵用金管理」（/admin/m/credits）
//   v674：改「打開不查、輸入關鍵字才查」—— 走伺服器端搜尋 /api/admin/users?q=（只回符合的、限 60 筆），
//         省流量/加速，避免一打開就抓全部會員。找到會員後展開卡片發放/調整抵用金。
//   POST /api/admin/credits（與桌機完整版同 body）。
import { useCallback, useEffect, useState } from "react";
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

export default function MobileCreditsPage() {
  const { ready } = useAdminAuth();
  const [users, setUsers] = useState<MUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // 展開中的會員 + 表單狀態
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  // 搜尋去抖 400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // v674：只有「有關鍵字」才查；打開（空字串）不抓任何資料
  useEffect(() => {
    if (!ready) return;
    if (!debouncedQ) {
      setUsers([]);
      setSearched(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    adminFetch<UsersResp>(`/api/admin/users?q=${encodeURIComponent(debouncedQ)}`)
      .then((d) => {
        if (!alive) return;
        setUsers(d.users ?? []);
        setSearched(true);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "查詢失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, debouncedQ]);

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
          placeholder="輸入姓名 / 電話 / 會員編號查詢"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          inputMode="search"
          autoFocus
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            清除
          </button>
        )}
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          查詢失敗：{error}
        </div>
      )}

      {/* 尚未輸入 → 提示，不查 */}
      {!debouncedQ && !loading && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          <Search className="mx-auto mb-2 h-7 w-7 opacity-40" />
          輸入關鍵字後查詢會員，再發放 / 調整抵用金
          <div className="mt-1 text-[11px] opacity-70">（姓名 / 電話 / 會員編號）</div>
        </div>
      )}

      {/* 會員卡列表 */}
      <div className="space-y-2">
        {users.map((u) => {
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

      {/* 查詢中 / 空狀態 / 60 上限 */}
      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          查詢中...
        </div>
      )}
      {!loading && searched && users.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          找不到符合「{debouncedQ}」的會員
        </div>
      )}
      {!loading && users.length >= 60 && (
        <div className="mt-1 py-2 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          最多顯示 60 筆，請輸入更完整的關鍵字縮小範圍
        </div>
      )}
    </MobileAdminShell>
  );
}
