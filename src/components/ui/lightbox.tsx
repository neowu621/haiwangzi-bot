"use client";
import { useEffect } from "react";
import { X, Download } from "lucide-react";

interface LightboxProps {
  open: boolean;
  src: string | null;
  alt?: string;
  caption?: string;
  downloadable?: boolean;
  onClose: () => void;
}

/**
 * 全螢幕圖片預覽
 * - 點背景關閉
 * - ESC 鍵關閉
 * - 可下載按鈕（給 trip photos）
 */
export function Lightbox({
  open,
  src,
  alt,
  caption,
  downloadable,
  onClose,
}: LightboxProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function download() {
    try {
      const res = await fetch(src!);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // 從 URL 抓 filename
      const filename = src!.split("/").pop()?.split("?")[0] ?? "photo.jpg";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[lightbox download]", e);
      // fallback: 直接開新分頁
      window.open(src!, "_blank");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur"
      onClick={onBackdropClick}
    >
      <div className="absolute right-3 top-3 flex gap-2 z-10">
        {downloadable && (
          <button
            type="button"
            onClick={download}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            title="下載"
          >
            <Download className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          title="關閉 (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative max-h-[90vh] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          className="max-h-[90vh] max-w-[95vw] rounded-md object-contain"
        />
      </div>

      {caption && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90vw] rounded-full bg-white/15 px-4 py-1.5 text-sm text-white backdrop-blur">
          {caption}
        </div>
      )}
    </div>
  );
}
