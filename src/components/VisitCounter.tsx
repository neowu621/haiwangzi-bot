"use client";
// v577：超輕量訪客計數 beacon。
//   - 每次全頁載入送一發（views +1）；同一瀏覽器當天第一次才標記 u=true（visitors +1）。
//   - 用 navigator.sendBeacon 背景送，完全不擋頁面載入；失敗無聲忽略。
//   - 後台 /admin 自己的瀏覽不計（避免老闆/教練灌水）。
//   - 隱私：本機只存一個當天旗標，伺服器只存每天總數，不放 cookie、不送任何身分。
import { useEffect } from "react";

export function VisitCounter() {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      // 後台頁不計
      if (window.location.pathname.startsWith("/admin")) return;

      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
      const key = `hwz_seen_${today}`;
      let isNew = false;
      try {
        isNew = !localStorage.getItem(key);
        if (isNew) localStorage.setItem(key, "1");
      } catch {
        /* 無痕模式等 localStorage 不可用 → 當作一般 view */
      }

      const url = "/api/track/visit";
      const body = JSON.stringify({ u: isNew });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* 計數絕不影響使用者 */
    }
  }, []);

  return null;
}
