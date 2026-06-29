"use client";
// 手機後台「訂單詳細」獨立頁（/admin/m/bookings/[id]）— v734
//   內容共用 <OrderDetail>；老闆結帳則以底部彈窗呈現同一元件。
import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { OrderDetail } from "@/components/admin-web/OrderDetail";

function Inner({ id }: { id: string }) {
  useAdminAuth();
  const sp = useSearchParams();
  const back = sp.get("from") || "/admin/m/tonight";
  return (
    <MobileAdminShell title="訂單詳細" back={back}>
      <OrderDetail id={id} />
    </MobileAdminShell>
  );
}

export default function MobileBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Inner id={id} />
    </Suspense>
  );
}
