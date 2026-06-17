"use client";
// 手機簡版後台外殼（/admin/m）— 刻意「輕」：
//   - 不帶 PC 側欄、不帶 ConnDiag（手機顧流量 / 載入）
//   - 首頁：logo + 使用者名 + 完整版 + 登出
//   - 子頁(帶 back/title)：「← 標題」可一鍵回 /admin/m + 完整版 + 登出
import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { APP_VERSION } from "@/lib/version";
import { LogOut, Monitor, ChevronLeft } from "lucide-react";
import { BrandMark } from "@/components/brand/MantaTrident";

// v576：子頁可帶 title + back —— 顯示「← 標題」頂部列(取代 logo)，
//   讓教練/老闆在任何子頁都能一鍵回 /admin/m 首頁。首頁本身不帶 back(顯示 logo)。
export function MobileAdminShell({
  children,
  title,
  back,
}: {
  children: ReactNode;
  title?: string;
  back?: string;
}) {
  const { ready, logout, adminUser } = useAdminAuth();
  const router = useRouter();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      </div>
    );
  }

  function toFullVersion() {
    // v570：用 ?desktop=1 看桌機(無狀態,不會卡住;下次重開 /admin 仍預設手機版)
    router.push("/admin?desktop=1");
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-pearl)" }}>
      {/* 頂部列 */}
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b px-2.5 py-2.5"
        style={{
          background: "var(--color-ocean-deep)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        {back ? (
          /* 子頁：← 返回首頁 + 標題 */
          <>
            <button
              type="button"
              onClick={() => router.push(back)}
              className="flex h-9 items-center gap-0.5 rounded-lg pl-1 pr-2 transition-colors hover:bg-white/10 active:scale-95"
              style={{ color: "var(--color-phosphor)" }}
              aria-label="返回首頁"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-[11px] font-medium">首頁</span>
            </button>
            <div className="min-w-0 flex-1">
              <span className="truncate text-[15px] font-bold" style={{ color: "#fff" }}>
                {title}
              </span>
            </div>
          </>
        ) : (
          /* 首頁：logo + 簡版後台 + 版本 + 使用者名 */
          <>
            {/* v490：鬼蝠魟三叉戟標誌 */}
            <BrandMark size={30} badge />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold" style={{ color: "var(--color-phosphor)" }}>
                  簡版後台
                </span>
                <span
                  className="rounded px-1 py-0.5 font-mono text-[8px]"
                  style={{ background: "rgba(0,217,203,0.18)", color: "var(--color-phosphor)" }}
                >
                  v{APP_VERSION}
                </span>
              </div>
              {adminUser && (
                <div className="truncate text-[10px]" style={{ color: "rgba(230,240,255,0.55)" }}>
                  {adminUser.realName ?? adminUser.displayName}
                </div>
              )}
            </div>
          </>
        )}

        {/* → 完整版 */}
        <button
          type="button"
          onClick={toFullVersion}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors hover:bg-white/10"
          style={{ color: "rgba(230,240,255,0.8)" }}
        >
          <Monitor className="h-3.5 w-3.5" />
          完整版
        </button>

        {/* 登出 */}
        <button
          type="button"
          onClick={logout}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "var(--color-coral)" }}
          title="登出"
          aria-label="登出"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* 內容 */}
      <main className="flex-1 p-3">{children}</main>
    </div>
  );
}
