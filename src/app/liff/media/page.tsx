"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Facebook, Instagram, Youtube, Anchor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";

interface MediaItem {
  id: string;
  date: string;
  platform: "fb" | "ig" | "yt" | "tiktok" | "other";
  url: string;
  caption: string | null;
  thumbnail: string | null;
  site: string | null;
  startTime: string | null;
}

const PLATFORM_INFO: Record<
  MediaItem["platform"],
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  fb: { label: "FB", color: "#1877F2", Icon: Facebook },
  ig: { label: "IG", color: "#E4405F", Icon: Instagram },
  yt: { label: "YT", color: "#FF0000", Icon: Youtube },
  tiktok: { label: "TT", color: "#000", Icon: ExternalLink },
  other: { label: "🔗", color: "#666", Icon: ExternalLink },
};

export default function MediaPage() {
  const liff = useLiff();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/media")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LiffShell
      title="最新動態"
      backHref="/liff/welcome"
      bottomNav={<BottomNav />}
    >
      <div className="space-y-3 px-4 pt-4">
        <div className="rounded-lg bg-[var(--muted)] p-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          📸 教練每次潛水後上傳：FB / IG / YouTube 連結 + 縮圖 + 一句說明。
          點縮圖跳到原平台看完整影片 / 照片。
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}

        {!loading && items.length === 0 && (
          <Card className="p-8 text-center text-xs text-[var(--muted-foreground)]">
            還沒有任何動態。教練拍完照片影片會上傳到這。
          </Card>
        )}

        {items.map((m) => {
          const p = PLATFORM_INFO[m.platform];
          const Icon = p.Icon;
          return (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="overflow-hidden transition-transform active:scale-[0.98]">
                {m.thumbnail && (
                  <div className="relative aspect-video bg-[var(--muted)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.thumbnail}
                      alt={m.caption ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                      <Icon className="h-3 w-3" />
                      {p.label}
                    </div>
                  </div>
                )}
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] tabular text-[var(--muted-foreground)]">
                    <span>{m.date}</span>
                    {m.site && (
                      <>
                        <span>·</span>
                        <Anchor className="h-3 w-3 opacity-60" />
                        <span>{m.site}</span>
                      </>
                    )}
                    {!m.thumbnail && (
                      <Badge
                        className="ml-auto text-[9px]"
                        style={{ backgroundColor: p.color, color: "#fff" }}
                      >
                        <Icon className="mr-0.5 h-2.5 w-2.5" />
                        {p.label}
                      </Badge>
                    )}
                  </div>
                  {m.caption && (
                    <p className="text-sm leading-snug">{m.caption}</p>
                  )}
                  <div className="flex items-center gap-1 pt-1 text-[11px] font-medium text-[var(--color-phosphor)]">
                    <ExternalLink className="h-3 w-3" />
                    在 {p.label} 看完整內容
                  </div>
                </CardContent>
              </Card>
            </a>
          );
        })}
      </div>
    </LiffShell>
  );
}
