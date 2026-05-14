"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Lightbox } from "@/components/ui/lightbox";
import { useLiff } from "@/lib/liff/LiffProvider";

interface TripPhoto {
  id: string;
  url: string;
  r2Key: string;
  caption: string | null;
  uploadedAt: string;
  expiresAt: string;
  daysLeft: number;
}

interface Props {
  tripId: string;
  /** 是否顯示 coach 上傳/刪除控制（admin 端 = true，客戶端 = false） */
  canManage?: boolean;
  /** 客戶可下載 */
  downloadable?: boolean;
}

/**
 * 場次當日照片 gallery
 * - canManage = true：可上傳、可刪除（coach/admin 用）
 * - canManage = false：只能看 + 下載（客戶用）
 * 點縮圖開 Lightbox 放大 + 下載
 */
export function TripPhotoGallery({
  tripId,
  canManage = false,
  downloadable = true,
}: Props) {
  const liff = useLiff();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<TripPhoto | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await liff.fetchWithAuth<{ photos: TripPhoto[] }>(
        `/api/trips/${tripId}/photos`,
      );
      setPhotos(r.photos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, liff]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          setError(`${file.name} 超過 8MB`);
          continue;
        }
        const presign = await liff.fetchWithAuth<{ url: string; key: string }>(
          "/api/uploads/presign",
          {
            method: "POST",
            body: JSON.stringify({
              prefix: "trips",
              filename: file.name,
              contentType: file.type,
              scope: tripId.slice(0, 8),
            }),
          },
        );
        const putRes = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error(`PUT ${putRes.status} for ${file.name}`);
        await liff.fetchWithAuth("/api/coach/trip-photos", {
          method: "POST",
          body: JSON.stringify({
            tripId,
            r2Key: presign.key,
            caption: file.name,
          }),
        });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(p: TripPhoto) {
    if (!confirm(`刪除這張照片？`)) return;
    try {
      await liff.fetchWithAuth(`/api/coach/trip-photos/${p.id}`, {
        method: "DELETE",
      });
      await reload();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="space-y-2">
      {canManage && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <>
                <Upload className="h-4 w-4 animate-pulse" />
                上傳中...
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                上傳今日照片（7 天後自動刪除）
              </>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      )}

      {error && (
        <div className="rounded-md bg-[var(--color-coral)]/15 px-2 py-1 text-[11px] text-[var(--color-coral)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-xs text-[var(--muted-foreground)] py-4">
          載入中...
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center text-xs text-[var(--muted-foreground)] py-4">
          {canManage
            ? "還沒有任何照片，按上方按鈕開始上傳"
            : "教練還沒上傳今日照片"}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-md">
              <button
                type="button"
                onClick={() => setLightbox(p)}
                className="block h-full w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? ""}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </button>
              <div className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                {p.daysLeft} 天
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-coral)] text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Lightbox
        open={lightbox !== null}
        src={lightbox?.url ?? null}
        caption={lightbox?.caption ?? undefined}
        downloadable={downloadable}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
