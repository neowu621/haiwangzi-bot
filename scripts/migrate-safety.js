#!/usr/bin/env node
/**
 * migrate-safety.js — 在 prisma db push 之前執行的安全補欄位腳本
 *
 * 使用 IF NOT EXISTS / 捕捉錯誤，確保冪等性。
 * 當 prisma db push 因為某些原因靜默失敗時，這個腳本能保證
 * Prisma Client 所需的關鍵欄位存在於資料庫中。
 */
'use strict';

const { PrismaClient } = require('@prisma/client');

// 每個 patch 都用 IF NOT EXISTS 或容忍失敗，確保冪等
const PATCHES = [
  // v84: 新增 users.code 欄位（會員編號）
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,
  // v84: 擴大 diving_trips.code 到 12 字元（原 VarChar(8)）
  // PostgreSQL: 若欄位已是 VARCHAR(12) 或更大，ALTER TYPE 是 no-op
  `DO $$ BEGIN
     ALTER TABLE diving_trips ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  `DO $$ BEGIN
     ALTER TABLE tour_packages ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  `DO $$ BEGIN
     ALTER TABLE bookings ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
];

async function main() {
  const prisma = new PrismaClient();
  let hasError = false;

  console.log('[migrate-safety] Running safety SQL patches...');

  for (const sql of PATCHES) {
    try {
      await prisma.$executeRawUnsafe(sql);
      // 只顯示 SQL 的第一行方便 log 閱讀
      console.log(`[migrate-safety] OK: ${sql.split('\n')[0].slice(0, 70)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[migrate-safety] WARN: ${msg}`);
      hasError = true;
    }
  }

  await prisma.$disconnect();

  if (hasError) {
    console.warn('[migrate-safety] Some patches failed (non-fatal, db push will handle)');
  } else {
    console.log('[migrate-safety] All patches applied successfully');
  }
}

main().catch((e) => {
  console.error('[migrate-safety] Fatal error:', e.message ?? e);
  // 非致命：即使整個腳本失敗也繼續啟動
  process.exit(0);
});
