"use client";
// 手機簡版後台外殼（/admin/m）— 刻意「輕」：
//   - 不帶 PC 側欄、不帶 ConnDiag（手機顧流量 / 載入）
//   - 頂部只放 logo + 使用者名 + 登出 + 「→ 完整版」切換鈕
//   切完整版：寫 localStorage admin_pref_layout="full" 後導 /admin
import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { APP_VERSION } from "@/lib/version";
import { LogOut, Monitor } from "lucide-react";
import { BrandMark } from "@/components/brand/MantaTrident";

export function MobileAdminShell({ children }: { children: ReactNode }) {
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
    try {
      localStorage.setItem("admin_pref_layout", "full");
    } catch {
      /* localStorage 不可用時忽略，仍導向完整版 */
    }
    router.push("/admin");
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-pearl)" }}>
      {/* 頂部列 */}
      <header
        className="sticky top-0 z-30 flex items-center gap-2.5 border-b px-3 py-2.5"
        style={{
          background: "var(--color-ocean-deep)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
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

        {/* → 完整版 */}
        <button
          type="button"
          onClick={toFullVersion}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors hover:bg-white/10"
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
