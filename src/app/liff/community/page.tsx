"use client";
import { useEffect, useState } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { ExternalLink } from "lucide-react";

interface ExternalLinks {
  fbGroupUrl?: string;
  mediaUrl?: string;
  youtubeChannelUrl?: string;
  instagramUrl?: string;
}

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "海王子潛水團";

// 各社群平台的設定
const CHANNELS = [
  {
    key: "facebook" as const,
    label: "Facebook 社團",
    desc: "潛友交流、活動分享",
    icon: "📘",
    bg: "#1877F2",
    field: "fbGroupUrl" as const,
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    desc: "每日潛水動態 Stories",
    icon: "📷",
    bg: "linear-gradient(135deg, #FCAF45 0%, #E1306C 50%, #5851DB 100%)",
    field: "instagramUrl" as const,
  },
  {
    key: "youtube" as const,
    label: "YouTube 頻道",
    desc: "潛水影片、海底實況",
    icon: "📺",
    bg: "#FF0000",
    field: "youtubeChannelUrl" as const,
  },
  {
    key: "media" as const,
    label: "更多動態",
    desc: "部落格 / 其他平台",
    icon: "🌐",
    bg: "#0A2342",
    field: "mediaUrl" as const,
  },
];

export default function CommunityPage() {
  const [links, setLinks] = useState<ExternalLinks>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setLinks(d.externalLinks ?? {}))
      .catch(() => setLinks({}))
      .finally(() => setLoading(false));
  }, []);

  const availableChannels = CHANNELS.filter((c) => {
    const url = links[c.field];
    return url && url.length > 0;
  });

  return (
    <LiffShell>
      <div className="px-4 pb-20 pt-4">
        {/* Hero */}
        <div className="rounded-2xl p-5 mb-5"
          style={{
            background: "linear-gradient(135deg, var(--color-ocean-deep), var(--color-ocean-surface))",
          }}>
          <h1 className="text-xl font-bold text-white mb-1">📱 最新動態</h1>
          <p className="text-sm text-white/80 leading-relaxed">
            追蹤 {APP_NAME} 的各平台，看王教練每天的潛水分享。
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        ) : availableChannels.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm text-[var(--muted-foreground)] mb-2">
              店家還沒設定社群連結
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              請聯絡管理員至後台新增 Facebook / Instagram / YouTube 連結。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {availableChannels.map((c) => {
              const url = links[c.field]!;
              return (
                <a
                  key={c.key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden shadow-sm transition-transform active:scale-[0.98]"
                  style={{ background: c.bg }}
                >
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 flex-shrink-0 text-3xl">
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0 text-white">
                      <div className="text-base font-bold">{c.label}</div>
                      <div className="text-xs opacity-90 mt-0.5">{c.desc}</div>
                      <div className="text-[10px] opacity-70 mt-1 truncate font-mono">
                        {url.replace(/^https?:\/\//, "")}
                      </div>
                    </div>
                    <ExternalLink className="h-5 w-5 text-white/80 flex-shrink-0" />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* 提示 */}
        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
          點擊開啟對應 app/網頁 · 按讚追蹤不錯過任何資訊 🤿
        </p>
      </div>
      <BottomNav />
    </LiffShell>
  );
}
