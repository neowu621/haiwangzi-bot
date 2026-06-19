"use client";
// v592：會員進入時跳出「當期公開優惠」彈窗。附「今日不再顯示」(localStorage)。
//   load() 由各端傳入(LIFF 用 liff.fetchWithAuth、/pclogin 用 cookie fetch)。
import { useEffect, useState } from "react";

export interface ActivePromo {
  code: string;
  title: string;
  label: string;
  endAt: string;
}

export function PromoPopup({ load }: { load: () => Promise<ActivePromo[]> }) {
  const [promo, setPromo] = useState<ActivePromo | null>(null);

  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
      if (localStorage.getItem(`hwz_promo_dismiss_${today}`)) return;
      load()
        .then((items) => { if (items && items[0]) setPromo(items[0]); })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, [load]);

  if (!promo) return null;
  const end = promo.endAt.slice(0, 10);
  const dismiss = (forToday: boolean) => {
    try {
      if (forToday) {
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
        localStorage.setItem(`hwz_promo_dismiss_${today}`, "1");
      }
    } catch { /* ignore */ }
    setPromo(null);
  };

  return (
    <div
      onClick={() => dismiss(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 300, maxWidth: "90vw", background: "#fff", borderRadius: 16, padding: 22, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}
      >
        <div style={{ fontSize: 30 }}>🎏</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0a2342", marginTop: 6 }}>{promo.title}</div>
        <div style={{ fontSize: 14, color: "#0a8f86", fontWeight: 700, marginTop: 4 }}>{promo.label}</div>
        <div style={{ fontSize: 13, color: "#5a6b7d", marginTop: 8, lineHeight: 1.7 }}>
          下單輸入優惠碼<br />
          <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: "#0a2342", letterSpacing: 1 }}>{promo.code}</span><br />
          <span style={{ fontSize: 12, color: "#8595a6" }}>至 {end} 止</span>
        </div>
        <button
          onClick={() => dismiss(false)}
          style={{ width: "100%", marginTop: 16, padding: "11px", background: "#0a8f86", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          知道了,去預約
        </button>
        <button
          onClick={() => dismiss(true)}
          style={{ marginTop: 10, background: "none", border: "none", color: "#9aabae", fontSize: 12, cursor: "pointer" }}
        >
          今日不再顯示
        </button>
      </div>
    </div>
  );
}
