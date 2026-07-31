"use client";
// v979：首頁橫向影片列共用「自動輪播 + 可手滑」邏輯。
//   用原生 overflow-x 捲動(手指可滑)，再用 rAF 自動遞增 scrollLeft；
//   使用者一碰(touch/滑鼠/滾輪)就暫停，放開後 1.8 秒自動接著跑，點卡片不會卡住。
//   內容需為「兩份複製」(seamless)：捲到前半段末端時無縫扣回。尊重 reduced-motion。
import { useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(enabled: boolean, speed = 42) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = 0;
    let paused = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    // 前半段(第一份複製)的實際寬度：用第 N/2 個子元素的 offsetLeft 差，含 gap 精準無縫
    const halfWidth = () => {
      const kids = el.children;
      const n = kids.length;
      if (n < 2) return 0;
      const mid = kids[Math.floor(n / 2)] as HTMLElement;
      const first = kids[0] as HTMLElement;
      return mid.offsetLeft - first.offsetLeft;
    };
    const wrap = () => {
      const h = halfWidth();
      if (h > 0 && el.scrollLeft >= h) el.scrollLeft -= h;
    };

    const step = (t: number) => {
      if (!last) last = t;
      const dt = t - last;
      last = t;
      if (!paused) {
        el.scrollLeft += (speed * dt) / 1000;
        wrap();
      }
      raf = requestAnimationFrame(step);
    };

    const pause = () => {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const resumeSoon = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        paused = false;
        last = 0;
      }, 1800);
      wrap();
    };
    const onWheel = () => {
      pause();
      resumeSoon();
    };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resumeSoon);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resumeSoon, { passive: true });
    el.addEventListener("touchcancel", resumeSoon, { passive: true });
    el.addEventListener("pointerdown", pause);
    window.addEventListener("pointerup", resumeSoon);
    el.addEventListener("wheel", onWheel, { passive: true });

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer) clearTimeout(resumeTimer);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resumeSoon);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resumeSoon);
      el.removeEventListener("touchcancel", resumeSoon);
      el.removeEventListener("pointerdown", pause);
      window.removeEventListener("pointerup", resumeSoon);
      el.removeEventListener("wheel", onWheel);
    };
  }, [enabled, speed]);

  return ref;
}
