"use client";
// v429: hero 泡泡產生器（從 page.tsx 抽出的 client island）。
//   v419：泡泡 30→14，降低 LINE 內建瀏覽器持續動畫負荷。
import { useEffect, useRef } from "react";

export default function Bubbles() {
  const bubbleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = bubbleRef.current;
    if (!box || box.childElementCount !== 0) return;
    for (let i = 0; i < 14; i++) {
      const b = document.createElement("span");
      const size = 4 + Math.random() * 16;
      b.style.left = Math.random() * 100 + "%";
      b.style.width = size + "px";
      b.style.height = size + "px";
      b.style.setProperty("--sway", (8 + Math.random() * 26).toFixed(0) + "px");
      b.style.setProperty("--op", (0.3 + Math.random() * 0.45).toFixed(2));
      b.style.animationDuration = (6 + Math.random() * 9).toFixed(1) + "s";
      b.style.animationDelay = (Math.random() * 8).toFixed(1) + "s";
      if (i % 3 === 0) b.style.filter = "blur(1.2px)";
      box.appendChild(b);
    }
  }, []);
  return <div className="bubbles" ref={bubbleRef} />;
}
