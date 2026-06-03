"use client";
import * as React from "react";

/**
 * v266：政策內文渲染（純文字 → 把 URL 變成「📋 複製連結」chip）
 *
 * Modal 內顯示政策條文時用。URL 不直接展開（避免行寬撐爆 + 視覺凌亂），
 * 改用一個小按鈕：點下去複製到剪貼簿，2 秒內變成 "✓ 已複製"。
 *
 * 保留純文字其它內容（含換行）。
 *
 * Usage:
 *   <PolicyText>{safetyPolicy}</PolicyText>
 */
export function PolicyText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  const text = children ?? "";
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(<CopyLinkChip key={`u${key++}`} url={m[1]} />);
    lastIdx = idx + m[1].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return (
    <pre
      className={
        className ??
        "whitespace-pre-wrap font-sans text-xs leading-6 text-[var(--foreground)]"
      }
    >
      {parts}
    </pre>
  );
}

function CopyLinkChip({ url }: { url: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "fail">("idle");

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      // fallback：在 LIFF iOS 上 navigator.clipboard 可能不可用，改用 document.execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setState("copied");
      } catch {
        setState("fail");
      }
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium align-middle"
      style={{
        borderColor:
          state === "copied" ? "#06C755" : "var(--color-phosphor, #00D9CB)",
        color: state === "copied" ? "#06C755" : "var(--color-phosphor, #00D9CB)",
        background:
          state === "copied"
            ? "rgba(6,199,85,0.08)"
            : "rgba(0,217,203,0.06)",
      }}
      title={url}
    >
      {state === "copied" ? "✓ 已複製" : state === "fail" ? "✗ 失敗" : "📋 複製連結"}
    </button>
  );
}
