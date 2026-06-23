"use client";
// v619：瀏覽器後台版「付款核對」獨立頁（admin-web 登入）。
import { use } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { PaymentVerifyView } from "@/components/PaymentVerifyView";

export default function AdminVerifyPage({ params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = use(params);
  const router = useRouter();
  return (
    <AdminShell title="付款核對">
      <PaymentVerifyView
        proofId={proofId}
        fetchJson={adminFetch}
        onDone={() => router.push("/admin/bookings")}
      />
    </AdminShell>
  );
}
