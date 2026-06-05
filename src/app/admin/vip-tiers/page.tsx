"use client";
// v345：VIP 設定已整合到「系統設定 → ⭐ VIP」tab，此頁改為轉址
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VipTiersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings?tab=vip");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
      VIP 設定已移至「系統設定 → ⭐ VIP」，正在前往…
    </div>
  );
}
