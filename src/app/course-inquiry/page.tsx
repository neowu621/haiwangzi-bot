// v749：「課程詢問」預覽頁。把潛水預約頁(/liff/booking)的「上面三個分頁」加第 4 個「課程詢問」的樣子做出來給老闆看。
//   這頁是獨立預覽（不影響線上 /liff/booking）；確認 OK 後再把 CourseInquiryContent 併進正式預約頁當第 4 分頁。
import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { CourseInquiryContent } from "@/components/liff/CourseInquiryContent";

export const metadata = {
  title: "課程詢問（預覽）",
  robots: { index: false, follow: false },
};

const TABS: Array<{ label: string; href?: string; active?: boolean }> = [
  { label: "一日潛水", href: "/liff/booking?tab=calendar" },
  { label: "旅行潛水", href: "/liff/booking?tab=tour" },
  { label: "預約潛水", href: "/liff/booking?tab=wishes" },
  { label: "課程詢問", active: true },
];

export default function CourseInquiryPreviewPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[600px] bg-[var(--background)] flex flex-col">
      {/* 頂部列（仿 LiffShell）*/}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur">
        <Link href="/" aria-label="回首頁" className="flex-shrink-0 active:scale-95">
          <Wordmark />
        </Link>
        <h1 className="truncate text-base font-bold tracking-tight">潛水預約</h1>
      </header>

      {/* 預覽提示條 */}
      <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-semibold text-amber-800">
        🔍 預覽版 — 「課程詢問」新分頁（確認後併進正式預約頁）
      </div>

      {/* 分頁列（四選項，仿 /liff/booking）*/}
      <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--background)] px-3 py-2">
        {TABS.map((t) =>
          t.active ? (
            <span key={t.label} className="flex-1 rounded-full bg-[var(--color-ocean-deep)] py-2 text-center text-sm font-semibold text-white">
              {t.label}
            </span>
          ) : (
            <Link key={t.label} href={t.href ?? "#"} className="flex-1 rounded-full bg-[var(--muted)] py-2 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              {t.label}
            </Link>
          ),
        )}
      </div>

      <main className="flex-1">
        <CourseInquiryContent />
      </main>
    </div>
  );
}
