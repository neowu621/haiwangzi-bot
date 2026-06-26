// v693：siteConfig 整列的共用快取（domain="config"）。
//   /api/config、/api/site-config 都讀同一列 → 共用同一個快取鍵，平時零 DB。
//   後台存檔(siteConfig 寫入)經 Prisma 蓋章 → 版本 +1 → 下次讀自動重抓。
import { prisma } from "./prisma";
import { cached, TTL_CONFIG } from "./cache";

export function getSiteConfigRow() {
  return cached("siteConfig:row", "config", TTL_CONFIG, () =>
    prisma.siteConfig.findUnique({ where: { id: "default" } }),
  );
}
