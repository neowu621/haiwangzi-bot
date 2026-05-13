import * as React from "react";
import { APP_VERSION } from "@/lib/version";

interface LogoProps {
  size?: number;
  mono?: boolean;
  dark?: boolean;
  className?: string;
}

/** L2 圓徽精煉版 (源自 ux-design/brand.jsx) */
export function Logo({
  size = 64,
  mono = false,
  dark = false,
  className,
}: LogoProps) {
  const ring = mono ? (dark ? "#fff" : "#0A2342") : "#0A2342";
  const ringInner = mono ? (dark ? "#fff" : "#1B3A5C") : "#1B3A5C";
  const fig = mono ? (dark ? "#fff" : "#0A2342") : "#0A2342";
  const accent = mono ? (dark ? "#fff" : "#0A2342") : "#00D9CB";
  const bg = dark && !mono ? "#0F1B2D" : "#fff";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ display: "block" }}
      className={className}
      aria-label="海王子潛水團"
    >
      <circle cx="60" cy="60" r="56" fill={bg} stroke={ring} strokeWidth="2.5" />
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke={ringInner}
        strokeOpacity="0.25"
        strokeWidth="0.8"
      />
      <line
        x1="14"
        y1="60"
        x2="106"
        y2="60"
        stroke={ring}
        strokeOpacity="0.18"
        strokeWidth="0.8"
      />
      <g fill={fig}>
        <rect x="38" y="44" width="10" height="22" rx="2" />
        <rect x="40" y="40" width="6" height="5" rx="1" />
        <path d="M50 38 q12 -8 22 -2 q4 3 3 8 l-1 5 q-2 4 -7 5 l-13 1 q-6 0 -6 -6 z" />
        <path
          d="M58 41 q5 -3 12 -1 q3 1 3 4 l-0.5 3 q-1 2 -3 2 l-9 0.5 q-3 0 -3 -3 z"
          fill={accent}
          opacity="0.85"
        />
        <path
          d="M70 55 q6 4 4 12 q-2 6 -8 6"
          fill="none"
          stroke={fig}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M48 56 q-4 2 -5 8 l-1 14 q0 4 4 4 l22 0 q4 0 4 -4 l-1 -10 q-1 -6 -6 -8 z" />
      </g>
      <g fill={accent}>
        <circle cx="80" cy="36" r="2.4" />
        <circle cx="86" cy="28" r="1.6" opacity="0.7" />
        <circle cx="82" cy="22" r="1" opacity="0.5" />
      </g>
      <g
        stroke={ring}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      >
        <line x1="60" y1="92" x2="60" y2="104" />
        <line x1="55" y1="96" x2="55" y2="102" />
        <line x1="65" y1="96" x2="65" y2="102" />
      </g>
    </svg>
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
