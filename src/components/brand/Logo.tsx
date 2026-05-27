import * as React from "react";
import Image from "next/image";
import { APP_VERSION } from "@/lib/version";

interface LogoProps {
  size?: number;
  className?: string;
  /** mono / dark 保留介面相容性，不影響圖片渲染 */
  mono?: boolean;
  dark?: boolean;
}

/** 圓形品牌 Logo — /public/logo.png */
export function Logo({ size = 64, className }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="海王子潛水團"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
      priority
    />
  );
}

/**
 * 三叉戟 (Poseidon's Trident) — 用在 welcome hero
 */
export function Trident({
  size = 48,
  color = "#00D9CB",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="trident"
    >
      {/* 中央桿 */}
      <line x1="40" y1="20" x2="40" y2="72" />
      {/* 三尖 */}
      <path d="M40 8 L40 20" />
      <path d="M22 20 L22 8 Q22 4 26 4 L26 4" />
      <path d="M22 20 L28 20" />
      <path d="M58 20 L58 8 Q58 4 54 4 L54 4" />
      <path d="M58 20 L52 20" />
      {/* 中尖頂 */}
      <path d="M36 14 L40 8 L44 14" fill={color} />
      {/* 左右尖頂 */}
      <path d="M19 11 L22 5 L25 11" fill={color} />
      <path d="M55 11 L58 5 L61 11" fill={color} />
      {/* 把手裝飾 */}
      <circle cx="40" cy="68" r="3" fill={color} />
      <line x1="34" y1="62" x2="46" y2="62" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Logo size={32} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wider">
            東北角海王子潛水
          </span>
          <span className="text-[10px] tabular tracking-[0.15em] text-[var(--muted-foreground)]">
            v{APP_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
}
