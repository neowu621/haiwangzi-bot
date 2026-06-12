"use client";
import { AdminShell } from "@/components/admin-web/AdminShell";
import PosterStudio from "@/app/poster/PosterStudio";

// v502：後台「業務推廣」— 行程海報產生器（自動抓真實場次生成可發社群的月曆圖）
export default function PromotionPage() {
  return (
    <AdminShell title="業務推廣">
      <PosterStudio embedded />
    </AdminShell>
  );
}
