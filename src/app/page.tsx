import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { APP_VERSION } from "@/lib/version";

// 直接打到根網址（haiwangzi.zeabur.app）時的入口頁
// 大多數使用者該透過 LIFF 連結進入；這頁是 SEO / 分享連結的友善 fallback
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-ocean-deep)] text-white">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-wider">海王子</span>
            <span className="text-[10px] tracking-[0.2em] opacity-70">
              DIVING TEAM
            </span>
          </div>
        </div>
        <a
          href="https://line.me/R/ti/p/@haiwangzi"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/20"
        >
          加 LINE 好友
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center">
        <h1 className="bg-gradient-to-r from-[var(--color-phosphor)] to-white bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-5xl">
          東北角海王子潛水團
        </h1>
        <p className="mt-3 text-base text-white/80 sm:text-lg">
          安全．專業．陪你看見海
        </p>

        <div className="mt-12 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-phosphor)]">
            手機開啟預約
          </p>
          <p className="mt-2 text-xs leading-relaxed opacity-80">
            本服務透過 LINE LIFF 提供，請從 LINE 點下方連結
          </p>

          <Link
            href="https://liff.line.me/2010006458-fyokMnVv"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-phosphor)] px-5 py-3 text-sm font-bold text-[var(--color-ocean-deep)] shadow-lg shadow-[var(--color-phosphor)]/30 transition-transform active:scale-[0.97]"
          >
            開啟 LINE 預約
          </Link>

          <p className="mt-4 text-[10px] opacity-50">
            或 LINE 搜尋官方帳號：
            <span className="font-mono">@haiwangzi</span>
          </p>
        </div>

        <div className="mt-12 grid w-full max-w-md grid-cols-3 gap-3 text-xs">
          <FeatureCard icon="🌊" title="日潛預約" desc="東北角全潛點" />
          <FeatureCard icon="✈️" title="旅遊潛水" desc="蘭嶼／綠島／墾丁" />
          <FeatureCard icon="📅" title="行事曆" desc="即時查座位" />
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-[10px] opacity-40">
        <span className="tabular">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
      <div className="text-xl">{icon}</div>
      <div className="mt-1 text-xs font-bold">{title}</div>
      <div className="mt-0.5 text-[10px] opacity-60">{desc}</div>
    </div>
  );
}
