"use client";
// v1074：點選式 FAQ 的浮動入口鈕。
//   刻意拆成「輕的入口 + 重的面板」兩個檔：
//   面板（FaqPanel，含選單樹與即時查詢）用 next/dynamic 在使用者「按下去」才載入，
//   首屏只背這顆按鈕。原本 v803 的 ChatWidget 是整包 648 行塞在全站 layout，
//   每個訪客不管開不開都得先下載 —— 那正是行動裝置前端鐵則要避免的事。
import { useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const FaqPanel = dynamic(() => import("./FaqPanel"), { ssr: false });

export default function FaqLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // 公開行銷頁才顯示（桌機首頁 / 手機首頁 / 場次表）；後台 /admin、會員區 /liff、付款頁都不顯示。
  const onPublic = pathname === "/" || pathname === "/mobile" || pathname === "/schedule";
  if (!onPublic) return null;

  if (open) return <FaqPanel onClose={() => setOpen(false)} />;

  return (
    <button
      type="button"
      aria-label="開啟常見問題"
      onClick={() => setOpen(true)}
      style={{
        position: "fixed", right: 16, bottom: 16, zIndex: 9998,
        width: 68, height: 68, borderRadius: "50%", border: "1px solid rgba(255,255,255,.68)", cursor: "pointer",
        background: "radial-gradient(circle at 35% 25%, #7ff7ee 0%, #0e9f93 52%, #075f67 100%)",
        color: "#fff", boxShadow: "0 10px 28px rgba(0,64,86,.34)",
        display: "grid", placeItems: "center", padding: 0,
        fontFamily: "-apple-system,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
      }}
    >
      <span aria-hidden style={{ fontSize: 25, lineHeight: 1 }}>💬</span>
      <span style={{
        position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
        background: "#0A2342", color: "#fff", fontSize: 10, fontWeight: 800,
        padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", border: "1.5px solid #fff",
      }}>常見問題</span>
    </button>
  );
}
