import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SAFETY_POLICY } from "@/lib/default-policies";
import { LegalShell } from "../_legal/LegalShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 讀 DB 最新安全政策

export const metadata: Metadata = {
  title: "潛水安全注意事項 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水安全須知：健康狀況評估、活動當日注意事項、保險提醒。潛水前請務必詳閱。",
  alternates: { canonical: "/safety" },
};

// 把純文字中的 URL 轉成可點連結（SEO + 可用性）
function linkify(text: string): React.ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener" style={{ color: "#0a8f86", wordBreak: "break-all" }}>{part}</a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default async function SafetyPage() {
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" }, select: { safetyPolicy: true } })
    .catch(() => null);
  const policy = cfg?.safetyPolicy || DEFAULT_SAFETY_POLICY;

  return (
    <LegalShell title="潛水安全注意事項" updated="2026-06-12" backHref="/" backLabel="返回首頁">
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.9 }}>{linkify(policy)}</div>
      <p style={{ marginTop: 28, fontSize: 13, color: "#7c9296", borderTop: "1px solid #e3e9f0", paddingTop: 16 }}>
        🌊 完成預約即視同已閱讀並同意以上安全須知。潛水安全第一，如有任何不適請勿勉強，歡迎直接 LINE 與汪汪教練聯繫。
      </p>
    </LegalShell>
  );
}
