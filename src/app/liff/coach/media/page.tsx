"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Facebook,
  Instagram,
  Youtube,
  ExternalLink,
  Upload,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

type Platform = "fb" | "ig" | "yt" | "tiktok" | "other";

interface MediaItem {
  id: string;
  date: string;
  platform: Platform;
  url: string;
  caption: string | null;
  thumbnail: string | null;
  thumbnailKey: string | null;
  createdBy: string | null;
}

const PLATFORM_INFO: Record<
  Platform,
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  fb: { label: "FB", color: "#1877F2", Icon: Facebook },
  ig: { label: "IG", color: "#E4405F", Icon: Instagram },
  yt: { label: "YT", color: "#FF0000", Icon: Youtube },
  tiktok: { label: "TT", color: "#000", Icon: ExternalLink },
  other: { label: "🔗", color: "#666", Icon: ExternalLink },
};

const PLATFORMS: Platform[] = ["fb", "ig", "yt", "tiktok", "other"];

function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch"))
    return "fb";
  if (u.includes("instagram.com")) return "ig";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "yt";
  if (u.includes("tiktok.com")) return "tiktok";
  return "other";
}

export default function CoachMediaPage() {
  const liff = useLiff();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 新增表單
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState<Platform>("fb");
  const [thumbnailKey, setThumbnailKey] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const d = await liff.fetchWithAuth<{ items: MediaItem[] }>(
        "/api/coach/media",
      );
      setItems(d.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  // 自動偵測 platform
  useEffect(() => {
    if (url.trim().length > 5) {
      const p = detectPlatform(url);
      setPlatform(p);
    }
  }, [url]);

  async function uploadThumbnail(file: File) {
    setUploading(true);
    try {
      const presign = await liff.fetchWithAuth<{
        url: string;
        key: string;
      }>("/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          prefix: "media",
          filename: file.name,
          contentType: file.type,
        }),
      });
      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`PUT ${putRes.status}`);
      setThumbnailKey(presign.key);
      setThumbnailPreview(URL.createObjectURL(file));
    } catch (e) {
      alert("縮圖上傳失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!url.trim()) {
      alert("請填連結");
      return;
    }
    setSaving(true);
    try {
      await liff.fetchWithAuth("/api/coach/media", {
        method: "POST",
        body: JSON.stringify({
          date,
          platform,
          url: url.trim(),
          caption: caption.trim() || undefined,
          thumbnailKey,
        }),
      });
      // reset
      setUrl("");
      setCaption("");
      setThumbnailKey(null);
      setThumbnailPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除這筆動態？")) return;
    await liff.fetchWithAuth(`/api/coach/media/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <LiffShell title="動態管理" backHref="/liff/coach/today">
      <div className="space-y-3 px-4 pt-4">
        {/* 新增表單 */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-bold">新增動態</div>
            <p className="-mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              先在 FB / IG / YouTube 發完文，把連結貼過來
              + 上傳一張縮圖（建議 1MB 以下），客戶就會在「最新動態」看到。
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">日期</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">平台 (自動偵測)</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PLATFORMS.map((p) => {
                    const info = PLATFORM_INFO[p];
                    const on = platform === p;
                    const Icon = info.Icon;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatform(p)}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          on
                            ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                            : "border-[var(--border)]",
                        )}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">連結 URL *</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.facebook.com/... 或 IG/YT 連結"
              />
            </div>

            <div>
              <Label className="text-xs">說明文字</Label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="例：今日鶯歌石 軟珊瑚很美"
                maxLength={200}
              />
            </div>

            <div>
              <Label className="text-xs">縮圖（建議 1MB 內）</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadThumbnail(f);
                }}
                className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border file:border-[var(--input)] file:bg-white file:px-3 file:py-1.5 file:text-xs"
              />
              {uploading && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                  <Upload className="h-3 w-3 animate-pulse" />
                  上傳中...
                </div>
              )}
              {thumbnailPreview && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailPreview}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                  <div className="text-[11px] text-[var(--color-phosphor)]">
                    <Check className="inline h-3 w-3" /> 已上傳
                  </div>
                </div>
              )}
            </div>

            <Button onClick={submit} disabled={saving || !url.trim()} className="w-full">
              <Plus className="h-4 w-4" />
              {saving ? "儲存中..." : "發布動態"}
            </Button>
          </CardContent>
        </Card>

        {/* 已上傳清單 */}
        <div className="text-sm font-bold pt-2">
          已發布 ({items.length})
        </div>

        {loading && (
          <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
            還沒上傳過動態
          </div>
        )}

        {items.map((m) => {
          const info = PLATFORM_INFO[m.platform];
          const Icon = info.Icon;
          return (
            <Card key={m.id}>
              <CardContent className="flex gap-3 p-3">
                {m.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnail}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded text-2xl"
                    style={{ backgroundColor: info.color + "20", color: info.color }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] tabular text-[var(--muted-foreground)]">
                    <span>{m.date}</span>
                    <Badge
                      className="text-[9px]"
                      style={{ backgroundColor: info.color, color: "#fff" }}
                    >
                      {info.label}
                    </Badge>
                  </div>
                  {m.caption && (
                    <div className="mt-0.5 line-clamp-2 text-xs">{m.caption}</div>
                  )}
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--color-phosphor)] hover:underline"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    開啟原連結
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="self-start rounded-full p-1.5 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                  aria-label="刪除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </LiffShell>
  );
}
