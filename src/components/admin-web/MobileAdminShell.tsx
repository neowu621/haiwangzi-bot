"use client";
// 手機簡版後台外殼（/admin/m）— 刻意「輕」：
//   - 不帶 PC 側欄、不帶 ConnDiag（手機顧流量 / 載入）
//   - 首頁：logo + 使用者名 + 完整版 + 登出
//   - 子頁(帶 back/title)：「← 標題」可一鍵回 /admin/m + 完整版 + 登出
import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { DiverLoader } from "@/components/ui/DiverLoader";

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
  const { ready } = useAdminAuth();
  const router = useRouter();

  if (!ready) {
    // v801：手機後台進場載入統一潛水員動畫（老闆 V2 圖樣）
    return (
      <div className="flex min-h-screen items-center justify-center">
        <DiverLoader label="載入中…" size={96} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      {/* v1020：頂部列改為與 LIFF 一致的淡色系（原深藍為舊版設定）——
          左：品牌 Wordmark(含版本)；右：頁面標題 + 返回。登出移除(統一在個人中心) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <Link href="/liff/profile" aria-label="回個人中心" className="flex-shrink-0 rounded-full active:scale-95">
          <Wordmark />
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          {title ? (
            <h1 className="truncate whitespace-nowrap text-base font-bold tracking-tight">{title}</h1>
          ) : null}
          {back ? (
            <button
              type="button"
              onClick={() => router.push(back)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--muted)] active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </header>

      {/* 內容 */}
      <main className="flex-1 p-3">{children}</main>
    </div>
  );
}
