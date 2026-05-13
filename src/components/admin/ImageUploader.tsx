"use client";
import { useRef, useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiff } from "@/lib/liff/LiffProvider";

interface ImageUploaderProps {
  /** R2 prefix（決定 bucket + 路徑） */
  prefix: "sites" | "trips" | "tours" | "media";
  /** 現有 R2 keys（DB 存的） */
  value: string[];
  onChange: (keys: string[]) => void;
  max?: number;
  hint?: string;
}

const PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "";

export function ImageUploader({
  prefix,
  value,
  onChange,
  max = 8,
  hint,
}: ImageUploaderProps) {
  const liff = useLiff();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (value.length + files.length > max) {
      setError(`最多 ${max} 張，目前已有 ${value.length} 張`);
      return;
    }
    setError(null);
    setUploading(true);
    const newKeys: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          setError(`${file.name} 不是圖片格式，已略過`);
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          setError(`${file.name} 超過 8MB，已略過`);
          continue;
        }
        const presign = await liff.fetchWithAuth<{
          url: string;
          key: string;
        }>("/api/uploads/presign", {
          method: "POST",
          body: JSON.stringify({
            prefix,
            filename: file.name,
            contentType: file.type,
          }),
        });
        const putRes = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error(`PUT ${putRes.status} for ${file.name}`);
        newKeys.push(presign.key);
      }
      if (newKeys.length > 0) onChange([...value, ...newKeys]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-1.5">
      {hint && (
        <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {value.map((key, i) => {
          const src = PUBLIC_BASE
            ? `${PUBLIC_BASE.replace(/\/$/, "")}/${key}`
            : key;
          return (
            <div
              key={key}
              className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`upload ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-coral)] text-white"
                title="移除"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          );
        })}
        {value.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {uploading ? (
              <Upload className="h-4 w-4 animate-pulse" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="text-[9px]">
              {uploading ? "上傳中" : `加圖 ${value.length}/${max}`}
            </span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && (
        <div className="text-[10px] text-[var(--color-coral)]">{error}</div>
      )}
    </div>
  );
}
