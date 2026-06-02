"use client";
import { useEffect, useState } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { ExternalLink, Pin } from "lucide-react";

interface ExternalLinks {
  fbGroupUrl?: string;
  mediaUrl?: string;
  youtubeChannelUrl?: string;
  instagramUrl?: string;
}

interface MediaPost {
  id: string;
  source: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  publishedAt: string;
  pinned: boolean;
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
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
      fetch("/api/media-posts").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([cfg, mp]) => {
        setLinks(cfg?.externalLinks ?? {});
        // 過濾未到發布時間的 post
        const now = new Date();
        const visible = (mp?.posts ?? []).filter(
          (p: MediaPost) => new Date(p.publishedAt) <= now,
        );
        setPosts(visible);
      })
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
          <LiffLoading variant="bubbles" label="正在載入社群動態..." />
        ) : (
        <>
          {/* 最新動態 posts */}
          {posts.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                📌 最新分享
              </div>
              <div className="space-y-3">
                {posts.map((p) => (
                  <a
                    key={p.id}
                    href={p.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden bg-white shadow-sm transition-transform active:scale-[0.98]"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.title} className="w-full aspect-video object-cover" />
                    )}
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        {p.pinned && (
                          <Pin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-[var(--color-phosphor)]" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-[var(--foreground)] line-clamp-2">
                            {p.title}
                          </div>
                          {p.description && (
                            <div className="mt-1 text-xs text-[var(--muted-foreground)] line-clamp-2">
                              {p.description}
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                            <ExternalLink className="h-2.5 w-2.5" />
                            {new Date(p.publishedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 社群平台連結 */}
          {availableChannels.length === 0 && posts.length === 0 ? (
            <div className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[var(--muted-foreground)] mb-2">
                店家還沒設定社群連結或分享動態
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                請聯絡管理員。
              </p>
            </div>
          ) : (
          <div className="space-y-3">
            {availableChannels.length > 0 && (
              <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                🔗 社群平台
              </div>
            )}
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
        </>
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
