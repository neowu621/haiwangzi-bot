"use client";
// v859：LIFF →後台「可連結」橋接頁 —— /liff/admin-go?to=/admin/m/tonight
//
// 為什麼需要：站內通知的「前往查看」是一般連結，直接連 /admin/* 會因為
//   LINE WebView 內沒有 admin-web token 而被 useAdminAuth 踢到 /admin/login（要密碼＝死路）。
//   個人中心的「老闆結帳」能進，是因為它按下去會先呼叫 liff-session 換 token。
//   這頁把同一套流程做成可連結的網址，讓通知/任何地方都能直接導向後台頁。
//
// 安全：token 由 /api/admin-web/liff-session 發（沿用 LINE idToken 驗身分 + boss/it 白名單），
//   非後台角色會被該 API 擋下（403）。`to` 只接受站內 /admin/ 開頭路徑，避免開放導向。
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLiff } from "@/lib/liff/LiffProvider";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { setAdminToken, setAdminUser, type AdminWebUser } from "@/lib/admin-web-auth";

const FALLBACK = "/admin/m";

// 只允許站內後台路徑（擋開放導向：//evil.com、http://…）
function safeTarget(raw: string | null): string {
  if (!raw) return FALLBACK;
  if (!raw.startsWith("/admin/")) return FALLBACK;
  if (raw.startsWith("//")) return FALLBACK;
  return raw;
}

function AdminGoInner() {
  const liff = useLiff();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const target = safeTarget(params.get("to"));

  useEffect(() => {
    if (!liff.ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await liff.fetchWithAuth<{ token: string; user: AdminWebUser }>(
          "/api/admin-web/liff-session",
          { method: "POST" },
        );
        if (cancelled) return;
        setAdminToken(r.token);
        setAdminUser(r.user);
        window.location.replace(target);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liff.ready, liff, target]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef3f6", fontFamily: "'Noto Sans TC','PingFang TC',sans-serif" }}>
        <div style={{ maxWidth: 380, background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 4px 20px rgba(10,35,66,.08)" }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🔒</div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: "#0A2342", margin: "0 0 8px" }}>無法進入後台</h1>
          <p style={{ fontSize: 13.5, color: "#5a6b7d", lineHeight: 1.7, margin: "0 0 16px" }}>{error}</p>
          <p style={{ fontSize: 12, color: "#7c9296", lineHeight: 1.7, margin: "0 0 16px" }}>
            後台僅開放老闆與 IT。若你應該有權限，請確認已用正確的 LINE 帳號登入。
          </p>
          <a href="/liff/profile" style={{ display: "inline-block", background: "#0A2342", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14, padding: "10px 20px", borderRadius: 10 }}>
            ← 回個人中心
          </a>
        </div>
      </div>
    );
  }

  return <LiffLoading label="正在進入後台…" />;
}

export default function AdminGoPage() {
  return (
    <Suspense fallback={<LiffLoading label="正在進入後台…" />}>
      <AdminGoInner />
    </Suspense>
  );
}
