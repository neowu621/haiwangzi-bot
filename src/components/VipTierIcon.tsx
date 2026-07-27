// v919：VIP 潛級圖示 —— 網頁用圖檔(public/vip/lv1..5.webp)，LINE/文字場合仍用 emoji。
//   放在圓形/透明容器都可（圖本身已是透明去背的徽章）。level 超出 1..5 時退回 emoji。
export function VipTierIcon({
  level,
  size = 40,
  emoji,
  className,
  alt,
}: {
  level: number;
  size?: number;
  emoji?: string;
  className?: string;
  alt?: string;
}) {
  if (level >= 1 && level <= 5) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/vip/lv${level}.webp`}
        alt={alt ?? `VIP LV${level}`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={className}
        style={{ width: size, height: size, objectFit: "contain", display: "block", flex: "none" }}
      />
    );
  }
  return (
    <span className={className} style={{ fontSize: Math.round(size * 0.72), lineHeight: 1 }} aria-hidden>
      {emoji ?? "🌊"}
    </span>
  );
}
