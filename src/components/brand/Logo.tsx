import * as React from "react";
import { APP_VERSION } from "@/lib/version";
import { BrandMark, MantaTridentMark } from "./MantaTrident";

interface LogoProps {
  size?: number;
  className?: string;
  /** mono / dark 保留介面相容性 */
  mono?: boolean;
  dark?: boolean;
}

/** v490：品牌 Logo — 鬼蝠魟三叉戟（深海藍圓角方塊 + 白圖案） */
export function Logo({ size = 64, className }: LogoProps) {
  return <BrandMark size={size} badge className={className} />;
}

/**
 * v490：品牌標誌（透明底版）— 取代舊三叉戟，給深色 hero 用。
 * 沿用 Trident 名稱維持既有 import 相容（SplashOverlay / liff welcome）。
 */
export function Trident({
  size = 48,
  color = "#00D9CB",
}: {
  size?: number;
  color?: string;
}) {
  return <MantaTridentMark size={size} color={color} />;
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
