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
    // v430：首屏無限動畫（泡泡/光束）延後到「載入完成後」才啟動 → 量測窗內首屏靜態、降 Speed Index。
    //   對使用者幾乎無感（動畫晚 ~0.3s 起跑），但對手機/LINE webview 持續動畫負荷也較友善。
    const root = box.closest(".hw");
    if (!root) return;
    const start = () => requestAnimationFrame(() => root.classList.add("anim-on"));
    if (document.readyState === "complete") {
      const t = window.setTimeout(start, 300);
      return () => window.clearTimeout(t);
    }
    let t: number | undefined;
    const onLoad = () => { t = window.setTimeout(start, 300); };
    window.addEventListener("load", onLoad, { once: true });
    return () => { window.removeEventListener("load", onLoad); if (t) window.clearTimeout(t); };
  }, []);
  return <div className="bubbles" ref={bubbleRef} />;
}
