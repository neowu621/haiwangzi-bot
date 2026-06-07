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
  // v112: 軟刪除欄位
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_reason TEXT`,

  // v256: Email 驗證機制
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_sent_at TIMESTAMPTZ`,
  // v257: 首單獎勵發放追蹤
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_order_reward_granted_at TIMESTAMPTZ`,
  // v256: Email 驗證 token 表
  `CREATE TABLE IF NOT EXISTS email_verify_tokens (
     token VARCHAR(64) PRIMARY KEY,
     user_id VARCHAR(64) NOT NULL,
     email VARCHAR(254) NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT email_verify_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(line_user_id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS email_verify_tokens_user_idx ON email_verify_tokens(user_id)`,

  // v257: 安全政策
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS safety_policy TEXT NOT NULL DEFAULT ''`,

  // v260: 手寫簽名（法律證據、長期保留、不會被 30 天清除規則砍）
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS signature_image_key VARCHAR(256)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS signed_from_user_agent TEXT`,

  // v261: 首單付款獎勵設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS first_order_reward_amount INT NOT NULL DEFAULT 100`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS first_order_reward_expiry_days INT NOT NULL DEFAULT 360`,

  // v264: 每日天氣自動回報設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_recipients JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_last_sent_at TIMESTAMPTZ`,

  // v275: 退款備註
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_note TEXT`,
  `ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_note TEXT`,

  // v280: 退款申請初始發起方
  `ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(16) NOT NULL DEFAULT 'admin'`,

  // v278: 訂單狀態歷史
  `CREATE TABLE IF NOT EXISTS booking_status_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id UUID NOT NULL,
     from_status VARCHAR(32),
     to_status VARCHAR(32) NOT NULL,
     actor_id VARCHAR(64),
     actor_role VARCHAR(16) NOT NULL,
     note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS booking_status_logs_booking_idx ON booking_status_logs(booking_id, created_at)`,
  // v276: BookingStatus enum 加兩個值（Postgres enum ADD VALUE IF NOT EXISTS 是 PG12+ 支援）
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_verify'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'BookingStatus')) THEN
       ALTER TYPE "BookingStatus" ADD VALUE 'awaiting_verify' AFTER 'pending';
     END IF;
   EXCEPTION WHEN undefined_object THEN NULL;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled_unpaid'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'BookingStatus')) THEN
       ALTER TYPE "BookingStatus" ADD VALUE 'cancelled_unpaid' AFTER 'cancelled_by_weather';
     END IF;
   EXCEPTION WHEN undefined_object THEN NULL;
   END $$;`,

  // v274: 退款申請（兩段式）
  `CREATE TABLE IF NOT EXISTS refund_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id UUID NOT NULL,
     requested_by VARCHAR(64) NOT NULL,
     method VARCHAR(16) NOT NULL,
     amount INT NOT NULL,
     credit_bonus_pct INT NOT NULL DEFAULT 0,
     reason TEXT,
     status VARCHAR(32) NOT NULL DEFAULT 'pending_customer',
     customer_note TEXT,
     responded_at TIMESTAMPTZ,
     executed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT refund_requests_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS refund_requests_booking_idx ON refund_requests(booking_id)`,

  // v131: MediaPost 表（最新動態，手動 post + 未來自動抓）
  `CREATE TABLE IF NOT EXISTS media_posts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     source VARCHAR(16) NOT NULL,
     external_id VARCHAR(128),
     title TEXT NOT NULL,
     description TEXT,
     image_url TEXT,
     link_url TEXT NOT NULL,
     published_at TIMESTAMPTZ NOT NULL,
     visible BOOLEAN NOT NULL DEFAULT TRUE,
     pinned BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS media_posts_visible_idx ON media_posts(visible, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS media_posts_source_external_idx ON media_posts(source, external_id)`,

  // v121: PageView 表（瀏覽追蹤 → 高意願客戶分析）
  `CREATE TABLE IF NOT EXISTS page_views (
     id TEXT PRIMARY KEY,
     user_id VARCHAR(64) NOT NULL,
     ref_type VARCHAR(16) NOT NULL,
     ref_id VARCHAR(64) NOT NULL,
     viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS page_views_user_idx ON page_views(user_id, viewed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS page_views_ref_idx ON page_views(ref_type, ref_id, viewed_at DESC)`,

  // ── code 欄位（先 ADD，後 ALTER TYPE 至 VARCHAR(12)）─────────────────
  // 注意：必須先 ADD COLUMN IF NOT EXISTS，否則 ALTER TYPE 在欄位不存在時會靜默失敗
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,
  `DO $$ BEGIN
     ALTER TABLE diving_trips ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  // 確保 unique constraint 也存在（Prisma client 期望此 index）
  `DO $$ BEGIN
     CREATE UNIQUE INDEX IF NOT EXISTS diving_trips_code_key ON diving_trips(code) WHERE code IS NOT NULL;
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS deposit_due_days INT NOT NULL DEFAULT 7`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,
  `DO $$ BEGIN
     ALTER TABLE tour_packages ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  `DO $$ BEGIN
     CREATE UNIQUE INDEX IF NOT EXISTS tour_packages_code_key ON tour_packages(code) WHERE code IS NOT NULL;
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,
  `DO $$ BEGIN
     ALTER TABLE bookings ALTER COLUMN code TYPE VARCHAR(12);
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  `DO $$ BEGIN
     CREATE UNIQUE INDEX IF NOT EXISTS bookings_code_key ON bookings(code) WHERE code IS NOT NULL;
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ── bookings 其他新欄位 ───────────────────────────────────────────────
  // 參加者明細（含個資、cert、log count 等）
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS participant_details JSONB DEFAULT '[]'::jsonb`,
  // 選擇的加購項目
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS selected_addons TEXT[] DEFAULT ARRAY[]::TEXT[]`,
  // 租借裝備
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rental_gear JSONB DEFAULT '[]'::jsonb`,
  // 網站備註（管理員填，客戶可見）
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS site_notes TEXT`,
  // 管理備註（僅 admin/boss 可見）
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT`,
  // 付款方式（cash/bank/linepay/other）— 用 VARCHAR 因 enum 改動風險高
  `DO $$ BEGIN
     CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank', 'linepay', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `DO $$ BEGIN
     ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method "PaymentMethod" DEFAULT 'cash';
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  // v289: payment_method 改為 nullable — 訂單建立時不指定付款方式
  `ALTER TABLE bookings ALTER COLUMN payment_method DROP NOT NULL`,
  `ALTER TABLE bookings ALTER COLUMN payment_method DROP DEFAULT`,
  // v296: 公開付款連結 token + 失效時間
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pay_link_token VARCHAR(64)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pay_link_verified_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_pay_link_token ON bookings(pay_link_token) WHERE pay_link_token IS NOT NULL`,
  // v297: payment_proofs 駁回保留紀錄 + 老闆說明
  `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`,
  `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS reject_reason TEXT`,
  // v311: 客戶 onboarding 完成時間
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`,
  // v315: 訂單日報設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_briefing_enabled BOOLEAN DEFAULT TRUE`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_briefing_include_coaches BOOLEAN DEFAULT TRUE`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_briefing_last_sent_at TIMESTAMPTZ`,
  // v318：客製化潛水願望單
  `CREATE TABLE IF NOT EXISTS dive_wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,
    preferred_date DATE NOT NULL,
    alternative_dates JSONB DEFAULT '[]',
    dive_site_ids JSONB DEFAULT '[]',
    other_sites TEXT,
    participants INTEGER DEFAULT 1,
    budget_per_person INTEGER,
    customer_note TEXT,
    reference_images JSONB DEFAULT '[]',
    messages JSONB DEFAULT '[]',
    status VARCHAR(16) DEFAULT 'pending',
    cancelled_by VARCHAR(16),
    cancellation_reason TEXT,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    converted_trip_id UUID,
    converted_tour_id UUID,
    converted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_dive_wishes_user FOREIGN KEY (user_id) REFERENCES users(line_user_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dive_wishes_user ON dive_wishes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dive_wishes_status ON dive_wishes(status)`,
  `CREATE INDEX IF NOT EXISTS idx_dive_wishes_last_activity ON dive_wishes(last_activity_at)`,
  // v328：願望單編號 W20260605-XX
  `ALTER TABLE dive_wishes ADD COLUMN IF NOT EXISTS code VARCHAR(12)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_dive_wishes_code ON dive_wishes(code) WHERE code IS NOT NULL`,
  // v334：前台活動紀錄 — audit_log 加 actor_role / actor_ip / actor_user_agent
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role VARCHAR(16)`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_ip VARCHAR(64)`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_user_agent TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_actor_role ON audit_log(actor_role)`,
  // 取消原因 / 退款相關
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount INTEGER`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_method VARCHAR(16)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS credit_used INTEGER DEFAULT 0`,

  // ── dive_sites 新欄位 ─────────────────────────────────────────────────
  // Google Maps URL
  `ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS location_url TEXT`,
  // v137: max_depth INT → VARCHAR(32) 允許 "20-30" 等範圍寫法
  // 用 DO 包起來避免重複轉換失敗中斷
  `DO $$ BEGIN
     ALTER TABLE dive_sites ALTER COLUMN max_depth TYPE VARCHAR(32) USING COALESCE(max_depth::text, '');
     ALTER TABLE dive_sites ALTER COLUMN max_depth SET DEFAULT '';
   EXCEPTION WHEN others THEN NULL;
   END $$`,
  // 處理舊資料的 NULL（避免 Prisma client schema 衝突）
  `UPDATE dive_sites SET max_depth = '' WHERE max_depth IS NULL`,
  `DO $$ BEGIN
     ALTER TABLE dive_sites ALTER COLUMN max_depth SET NOT NULL;
   EXCEPTION WHEN others THEN NULL;
   END $$`,

  // ── tour_packages reminder 天數欄位 ──────────────────────────────────
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS deposit_reminder_days INTEGER DEFAULT 7`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS final_reminder_days INTEGER DEFAULT 30`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS guide_reminder_days INTEGER DEFAULT 2`,

  // ── v225 credit_txs 加 code 欄位 ─────────────────────────────────────
  `ALTER TABLE credit_txs ADD COLUMN IF NOT EXISTS code VARCHAR(16)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credit_txs_code_key ON credit_txs(code) WHERE code IS NOT NULL`,

  // ── v227 site_config 加取消政策欄位 ──────────────────────────────────
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS cancellation_policy TEXT NOT NULL DEFAULT ''`,

  // ── v238 payment_proofs：image 可選 + 加 last5 / note ──────────────
  `ALTER TABLE payment_proofs ALTER COLUMN image_key DROP NOT NULL`,
  `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS last5 VARCHAR(8)`,
  `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS note TEXT`,

  // ── v196 message_templates 加管道開關 ───────────────────────────────
  `ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS line_enabled BOOLEAN`,
  `ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN`,

  // ── v186 tour_packages 行銷欄位 ─────────────────────────────────────
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS subtitle TEXT`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS duration_label TEXT`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS room_label TEXT`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS dive_styles TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS beginner_friendly BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS tanks_count INTEGER`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS site_list TEXT`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS pricing_notes TEXT`,
  `ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS extra_note TEXT`,

  // ── diving_trips 新欄位（v91+）───────────────────────────────────────
  // meeting_point: 集合地點
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS meeting_point TEXT`,
  // meeting_point_url: 集合地點 Google Map URL（與 meeting_point 分欄）
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS meeting_point_url TEXT`,
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
  // v126: 外部連結（FB 社群、媒體頻道等）
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS external_links JSONB NOT NULL DEFAULT '{}'`,
  // v160: 付款資訊（銀行 + LINE Pay）— 改用 DB 管理，env vars 降為 fallback
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_info JSONB NOT NULL DEFAULT '{}'`,
  // v160: bookings.payment_note — 客戶選「其他」付款方式時填寫的說明
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_note TEXT`,
  // v179: diving_trips.reference_video_url — 潛點介紹參考影片
  `ALTER TABLE diving_trips ADD COLUMN IF NOT EXISTS reference_video_url TEXT`,
  // v184: 生日禮金有效天數設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS birthday_credit_expiry_days INTEGER NOT NULL DEFAULT 360`,
  // v184: CreditTx 到期時間（null = 永不過期）
  `ALTER TABLE credit_txs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
  // v185: VIP 升等 / admin 手動發 / 退款轉禮金 各自的預設有效天數
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS vip_upgrade_credit_expiry_days INTEGER NOT NULL DEFAULT 360`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS admin_grant_credit_expiry_days INTEGER NOT NULL DEFAULT 360`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS refund_credit_expiry_days INTEGER NOT NULL DEFAULT 0`,

  // v366: 付款/折抵逐筆明細帳（prisma db push 因既有 drift 失敗，靠這裡保證建表）
  `CREATE TABLE IF NOT EXISTS payment_entries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id UUID NOT NULL,
     amount INT NOT NULL,
     kind VARCHAR(24) NOT NULL,
     is_cash BOOLEAN NOT NULL DEFAULT TRUE,
     note TEXT,
     created_by_id VARCHAR(64),
     created_by_name VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT payment_entries_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS payment_entries_booking_created_idx ON payment_entries(booking_id, created_at DESC)`,

  // v379: 付款證明縮圖 base64（存 DB，永遠看得到、加速）
  `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS thumb_base64 TEXT`,

  // v388: 註冊禮金 + VIP5 滿級回饋設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS signup_reward_amount INTEGER NOT NULL DEFAULT 50`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS signup_reward_expiry_days INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS vip_overflow_dives INTEGER NOT NULL DEFAULT 50`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS vip_overflow_credit INTEGER NOT NULL DEFAULT 1000`,

  // v381: 補上 schema 早已宣告、但 prod 當初用 migrate-safety 加欄時漏掉的 UNIQUE 索引。
  //   這是 prisma db push 一直噴 data-loss 而失敗的根因（它想加唯一約束但不敢動）。
  //   用 Prisma 慣例命名（{table}_{column}_key）讓 db push 比對後視為一致 → 之後乾淨通過。
  //   都是可空欄位（NULL 不衝突）；若真有重複值，建索引會失敗 → 上面 try/catch 只 WARN 不中止。
  `CREATE UNIQUE INDEX IF NOT EXISTS users_code_key ON users(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credit_txs_code_key ON credit_txs(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS diving_trips_code_key ON diving_trips(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tour_packages_code_key ON tour_packages(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dive_wishes_code_key ON dive_wishes(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bookings_code_key ON bookings(code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bookings_pay_link_token_key ON bookings(pay_link_token)`,
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
