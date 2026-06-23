"use client";
// v619：手機 LINE LIFF 版「付款核對」獨立頁（LINE 登入即可，不需後台密碼）。
import { use } from "react";
import { useRouter } from "next/navigation";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { PaymentVerifyView } from "@/components/PaymentVerifyView";

export default function LiffVerifyPage({ params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = use(params);
  const liff = useLiff();
  const router = useRouter();
  return (
    <LiffShell title="付款核對" backHref="/liff/coach/today">
      <PaymentVerifyView
        proofId={proofId}
        fetchJson={liff.fetchWithAuth}
        onDone={() => router.push("/liff/coach/today")}
      />
    </LiffShell>
  );
}
