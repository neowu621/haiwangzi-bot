import { PrismaClient } from "@prisma/client";
import { bumpVersion } from "./cache";

// v693：在 Prisma 層「集中蓋章」——任何寫入(create/update/delete…)經過時，
//   自動把對應 domain 的快取版本 +1(見 src/lib/cache.ts)。
//   因為所有寫入都過 Prisma，掛這裡 = 後台 CRUD / seed / bulk-import / 下單 / 取消 全涵蓋，不會漏勾。
const WRITE_OPS = new Set([
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "updateManyAndReturn",
  "upsert", "delete", "deleteMany",
]);

function makeClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      divingTrip: {
        async $allOperations({ operation, args, query }) {
          const r = await query(args);
          if (WRITE_OPS.has(operation)) bumpVersion("trips");
          return r;
        },
      },
      tourPackage: {
        async $allOperations({ operation, args, query }) {
          const r = await query(args);
          if (WRITE_OPS.has(operation)) bumpVersion("tours");
          return r;
        },
      },
      // 預約建立/取消會改到「剩餘空位」→ 同時讓 trips 與 tours 快取失效
      booking: {
        async $allOperations({ operation, args, query }) {
          const r = await query(args);
          if (WRITE_OPS.has(operation)) { bumpVersion("trips"); bumpVersion("tours"); }
          return r;
        },
      },
      // 營業設定 / 政策 / 裝備價 / VIP 級距 / 抵用金規則皆存於 siteConfig
      siteConfig: {
        async $allOperations({ operation, args, query }) {
          const r = await query(args);
          if (WRITE_OPS.has(operation)) bumpVersion("config");
          return r;
        },
      },
    },
  });
}

// 避免 dev hot-reload 開無數條連線 / 重複套 extension
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
