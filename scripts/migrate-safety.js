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
  // ── users ─────────────────────────────────────────────────────────
  // v84: 新增 users.code 欄位（會員編號）
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,

  // ── code VARCHAR 擴充（由 VarChar(8) → 12）──────────────────────────
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

  // ── diving_trips 新欄位（v91+）───────────────────────────────────────
  // meeting_point: 集合地點
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS meeting_point TEXT`,
  // weather_note: 天氣取消說明
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS weather_note TEXT`,
  // cancel_reason: 取消原因 enum — 需先確保 enum type 存在
  `DO $$ BEGIN
     CREATE TYPE "CancelReason" AS ENUM ('weather', 'insufficient', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `DO $$ BEGIN
     ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS cancel_reason "CancelReason";
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ── site_config 新欄位（plan v66+）──────────────────────────────────
  // 裝備租借費率 (JSON)
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS gear_rental_prices JSONB NOT NULL DEFAULT '{}'`,
  // 場次預設定價 (JSON)
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS default_trip_pricing JSONB NOT NULL DEFAULT '{}'`,
  // 教練預設費用
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS default_coach_fee INTEGER NOT NULL DEFAULT 1500`,
  // 天氣取消風速門檻 (m/s)
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_wind_threshold INTEGER NOT NULL DEFAULT 10`,
  // 生日禮金金額
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS birthday_credit_amount INTEGER NOT NULL DEFAULT 100`,
  // VIP 升等獎金 (JSON)
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS vip_upgrade_credits JSONB NOT NULL DEFAULT '{}'`,
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
