"use client";
// v619：付款核對中轉頁 — 依環境把通知「前往查看」導到正確版本。
//   在 LINE App(LIFF WebView) → 手機版 /liff/coach/verify；其餘瀏覽器 → 後台版 /admin/verify。
import { use, useEffect, useState } from "react";

export default function VerifyProofRedirect({ params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = use(params);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const inLine = /\bLine\//i.test(ua) || /Line/i.test(ua); // LINE in-app WebView
    const t = inLine ? `/liff/coach/verify/${proofId}` : `/admin/verify/${proofId}`;
    setTarget(t);
    window.location.replace(t);
  }, [proofId]);

  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b", fontSize: 14 }}>
      正在開啟付款核對…
      {target && (
        <div style={{ marginTop: 12 }}>
          <a href={target} style={{ color: "#0a8f86" }}>若沒有自動跳轉，請點此</a>
        </div>
      )}
    </div>
  );
}
