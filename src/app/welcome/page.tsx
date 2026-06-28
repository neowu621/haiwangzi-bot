"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { APP_VERSION } from "@/lib/version";
import { loadLiffClient } from "@/lib/liff/client";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "潛水團";
const TAGLINE = process.env.NEXT_PUBLIC_APP_TAGLINE ?? "安全．專業．陪你看見海";
const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "#";
const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "";
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
const LIFF_URL = LIFF_ID ? `https://liff.line.me/${LIFF_ID}` : "#";

export default function HomePage() {
  // 好友狀態：null = 還在偵測 / 無法偵測（桌面瀏覽器）/ true = 已是好友 / false = 尚未加好友
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    // 載入 LINE OA QR URL（後台設定）
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setQrUrl(c.externalLinks?.lineOaQrUrl ?? ""))
      .catch(() => {});

    // 嘗試用 LIFF SDK 偵測好友關係（只有在 LINE in-app 瀏覽器中才會成功）
    if (!LIFF_ID) return;
    (async () => {
      try {
        const liff = await loadLiffClient();
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const friendship = await liff.getFriendship();
          setIsFriend(friendship.friendFlag);
        }
      } catch {
        // 桌面瀏覽器或其他無法初始化 LIFF 的環境 → 保持 null
      }
    })();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-ocean-deep)] text-white">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-wider">{APP_NAME}</span>
            <span className="text-[10px] tracking-[0.2em] opacity-70">
              DIVING TEAM
            </span>
          </div>
        </div>
        {/* 右上角的加 LINE 好友按鈕已移到中央 */}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center">
        <h1 className="bg-gradient-to-r from-[var(--color-phosphor)] to-white bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-5xl">
          {APP_NAME}
        </h1>
        <p className="mt-3 text-base text-white/80 sm:text-lg">
          {TAGLINE}
        </p>

        {/* === 加好友狀態提示 + 按鈕（中央顯眼）=== */}
        {isFriend === true ? (
          // 已加好友
          <div className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#06C755]/15 px-5 py-3 ring-2 ring-[#06C755]/40">
            <span className="text-2xl">💚</span>
            <span className="text-lg font-bold text-[#06C755]">
              已成為好友
            </span>
          </div>
        ) : (
          // 未加 / 未知 — 預設顯示「請加入好友」+ QR + 大按鈕
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🔱</span>
              <span className="text-2xl font-bold tracking-wide text-white sm:text-3xl">
                請加入 LINE 好友
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/80 max-w-sm">
              加好友後才能用手機 LINE 預約 / 查詢訂單 / 接收行前通知
            </p>
            {/* QR Code (admin 後台有設才顯示) */}
            {qrUrl && (
              <div className="flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="LINE OA QR"
                  className="h-44 w-44 rounded-xl border-2 bg-white p-2 shadow-lg"
                  style={{ borderColor: "rgba(6,199,85,0.5)" }}
                />
                <p className="mt-1.5 text-[11px] text-white/70">📱 用 LINE 掃 QR 直接加好友</p>
              </div>
            )}
            {LINE_ADD_FRIEND_URL !== "#" && (
              <a
                href={LINE_ADD_FRIEND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#06C755]/40 transition-transform active:scale-95"
                style={{ background: "#06C755" }}
              >
                <span className="text-2xl">✚</span>
                加入 LINE 好友
              </a>
            )}
            {LINE_OA_ID && (
              <p className="text-[11px] opacity-60">
                或 LINE 搜尋官方帳號：
                <span className="ml-1 font-mono font-semibold">{LINE_OA_ID}</span>
              </p>
            )}
          </div>
        )}

        {/* 開啟 LIFF 預約 — 縮為次要按鈕 */}
        <div className="mt-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-phosphor)]">
            手機開啟預約
          </p>
          <p className="mt-1 text-[11px] leading-relaxed opacity-70">
            本服務透過 LINE LIFF 提供，請從 LINE 點下方連結
          </p>
          <Link
            href={LIFF_URL}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-phosphor)]/90 px-5 py-2.5 text-sm font-bold text-[var(--color-ocean-deep)] transition-transform active:scale-[0.97]"
          >
            開啟 LINE 預約
          </Link>
        </div>

        <div className="mt-10 grid w-full max-w-md grid-cols-3 gap-3 text-xs">
          <FeatureCard icon="🌊" title="日潛預約" desc="全潛點" />
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
