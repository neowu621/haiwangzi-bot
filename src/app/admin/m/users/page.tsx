"use client";
// 手機簡版後台「會員快查」（/admin/m/users）
//   v674：改「打開不查、輸入關鍵字才查」—— 走伺服器端搜尋 /api/admin/users?q=（只回符合的、限 60 筆），
//         省流量/加速，避免一打開就抓全部會員 + 算每人統計。移除 VIP 等級篩選。
//   點一筆導去 /admin/users 做細節操作（編輯 / 抵用金 / 潛水紀錄）。
import { useEffect, useState } from "react";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { getVipTier } from "@/lib/vip-tier";
import { toTaipeiDateString } from "@/lib/utils";
import { Search } from "lucide-react";

// 只取手機卡片需要的欄位（API 回的是完整 User，多餘欄位忽略即可）
interface MUser {
  lineUserId: string;
  code: string | null;
  displayName: string;
  realName: string | null;
  phone: string | null;
  vipLevel: number;
  creditBalance: number;
  logCount: number;
  haiwangziLogCount: number;
  lastActiveAt: string;
}
interface Resp {
  users: MUser[];
}

export default function MobileUsersPage() {
  const { ready } = useAdminAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [users, setUsers] = useState<MUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    adminFetch<Resp>(`/api/admin/users?q=${encodeURIComponent(debouncedQ)}`)
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

  return (
    <MobileAdminShell title="會員查詢" back="/admin/m">
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
          輸入關鍵字後開始查詢
          <div className="mt-1 text-[11px] opacity-70">（姓名 / 電話 / 會員編號）</div>
        </div>
      )}

      {/* 列表 */}
      <div className="space-y-2">
        {users.map((u) => {
          const name = u.realName ?? u.displayName;
          const tier = getVipTier(u.vipLevel);
          return (
            <div
              key={u.lineUserId}
              className="block rounded-xl border px-3 py-2.5"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{name}</span>
                {u.vipLevel > 0 && (
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-ocean-deep)" }}
                  >
                    LV{u.vipLevel} {tier.name}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {u.code ? u.code : "未編號"}
                {u.phone ? `・${u.phone}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                <span style={{ color: "var(--muted-foreground)" }}>
                  抵用金{" "}
                  <span
                    className="font-mono tabular-nums font-semibold"
                    style={{ color: u.creditBalance > 0 ? "var(--color-coral)" : "inherit" }}
                  >
                    {u.creditBalance.toLocaleString()}
                  </span>
                </span>
                <span style={{ color: "var(--muted-foreground)" }}>
                  潛水{" "}
                  <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--color-ocean-deep)" }}>
                    {u.haiwangziLogCount ?? 0}
                  </span>
                  {u.logCount ? <span className="opacity-60">/{u.logCount}</span> : ""} 次
                </span>
                {u.lastActiveAt && (
                  <span className="font-mono tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                    {toTaipeiDateString(u.lastActiveAt)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 載入 / 空狀態 */}
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
