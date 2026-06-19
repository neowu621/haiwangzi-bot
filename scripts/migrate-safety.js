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

  // v470: Email 發送路徑（gmail / zsend / fallback）
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS email_provider VARCHAR(16) NOT NULL DEFAULT 'gmail'`,

  // v519: 訊息模板「提前幾天通知」全域設定（原本寫死在 cron）
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS d1_reminder_lead_days INT NOT NULL DEFAULT 1`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS final_early_lead_days INT NOT NULL DEFAULT 33`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS deposit_remind_before_days INT NOT NULL DEFAULT 2`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS credit_expiry_lead_days INT NOT NULL DEFAULT 7`,

  // v473: 訊息發送紀錄表（LINE / Email / 站內通知 每筆發送一列）
  `CREATE TABLE IF NOT EXISTS message_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     channel VARCHAR(8) NOT NULL,
     template_key VARCHAR(64) NOT NULL,
     recipient_id VARCHAR(64),
     recipient VARCHAR(254) NOT NULL,
     title TEXT NOT NULL,
     status VARCHAR(12) NOT NULL,
     error TEXT,
     source VARCHAR(32) NOT NULL DEFAULT 'system',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS message_logs_created_idx ON message_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS message_logs_channel_idx ON message_logs(channel, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS message_logs_status_idx ON message_logs(status, created_at DESC)`,

  // v475: 客製化訂單 — BookingType 加 custom、Booking 加客製欄位（refId 維持非空，custom 填隨機 UUID）
  `ALTER TYPE "BookingType" ADD VALUE IF NOT EXISTS 'custom'`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_item_name VARCHAR(128)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_category VARCHAR(32)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_ref_url TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_pdf_key VARCHAR(256)`,
  // v475: 合約範本表
  `CREATE TABLE IF NOT EXISTS contract_templates (
     id TEXT PRIMARY KEY,
     category VARCHAR(32) NOT NULL UNIQUE,
     title VARCHAR(128) NOT NULL,
     content TEXT NOT NULL,
     ref_url TEXT,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     sort_order INT NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_by VARCHAR(64)
   )`,

  // v264: 每日天氣自動回報設定
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_recipients JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS daily_weather_report_last_sent_at TIMESTAMPTZ`,
  // v389：天氣回報時段（台灣時間）+ 內容開關
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_report_slots JSONB NOT NULL DEFAULT '[{"h":22,"m":0},{"h":5,"m":0}]'::jsonb`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_report_content JSONB NOT NULL DEFAULT '{"wind":true,"temp":true,"sessions":true,"wave":false}'::jsonb`,

  // v403: 首頁影片清單 + 模式（DB 管理）
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_videos_mode VARCHAR(16) NOT NULL DEFAULT 'curated'`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_videos JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // v406：最新動態進階
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_video_featured_id VARCHAR(32) NOT NULL DEFAULT ''`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_video_count INTEGER NOT NULL DEFAULT 5`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_video_exclude_ids JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_video_filter VARCHAR(8) NOT NULL DEFAULT 'all'`,
  // v409: 首頁「學員怎麼說」6 格
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_testimonials JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // v414: 學員怎麼說總結語
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_reviews_note TEXT NOT NULL DEFAULT ''`,
  // v420: 抵用金到期提醒已寄出時間 + expires_at 索引（防到期 cron 全表掃描）
  `ALTER TABLE credit_txs ADD COLUMN IF NOT EXISTS expiry_reminded_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS "credit_txs_expires_at_idx" ON credit_txs (expires_at)`,
  // v411: 海象（浮標+潮位）整合進每日天氣回報
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_marine_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_marine_points JSONB NOT NULL DEFAULT '[{"label":"龍洞區","buoyId":"46694A","tideId":"C4A02"},{"label":"基隆區","buoyId":"C6B01","tideId":"C4B01"}]'::jsonb`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS weather_marine_fields JSONB NOT NULL DEFAULT '{"waveHeight":true,"waveDir":true,"wavePeriod":true,"seaTemp":true,"current":true,"tide":true}'::jsonb`,

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
  // 站內訊息通知（第三通道）模板層開關（null = 用 template 預設 defaultInApp）
  `ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS in_app_enabled BOOLEAN`,
  // v480: footer hint field (first_order_reward_grant etc.)
  `ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS footer_hint TEXT`,

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
  // v391: 場次 Dump 自動優惠開頭
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS dump_promo_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS dump_promo_text TEXT NOT NULL DEFAULT ''`,
  // v392: 氣瓶限時折扣
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS tank_promo_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS tank_promo_discount INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS tank_promo_reason TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS tank_promo_start TIMESTAMPTZ`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS tank_promo_end TIMESTAMPTZ`,

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

  // 站內訊息通知（第三通道）— App 內通知中心
  `CREATE TABLE IF NOT EXISTS notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id VARCHAR(64) NOT NULL,
     template_key VARCHAR(64) NOT NULL,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     link_url TEXT,
     icon VARCHAR(16),
     is_read BOOLEAN NOT NULL DEFAULT FALSE,
     read_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(line_user_id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, is_read)`,

  // ── v521/v522：客服信箱 Console（email console）─────────────────────
  //   prisma db push 因既有 drift 一直失敗（data-loss），新表/enum 一律靠 migrate-safety 建。
  //   enum 名稱與 model @@map 須與 Prisma schema 一致：ThreadStatus / Direction / MessageStatus，
  //   email_threads / email_messages / suppressed_emails。
  `DO $$ BEGIN CREATE TYPE "ThreadStatus" AS ENUM ('WAITING','PROCESSING','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "Direction" AS ENUM ('INBOUND','OUTBOUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED','QUEUED','SENT','DELIVERED','BOUNCED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS email_threads (
     id TEXT PRIMARY KEY,
     subject TEXT NOT NULL,
     customer_email TEXT NOT NULL,
     customer_name TEXT,
     status "ThreadStatus" NOT NULL DEFAULT 'WAITING',
     tags TEXT[] NOT NULL DEFAULT '{}',
     assignee TEXT,
     booking_id UUID,
     last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT email_threads_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
   )`,
  `CREATE INDEX IF NOT EXISTS email_threads_status_idx ON email_threads(status, last_message_at)`,
  `CREATE INDEX IF NOT EXISTS email_threads_customer_idx ON email_threads(customer_email)`,
  `CREATE TABLE IF NOT EXISTS email_messages (
     id TEXT PRIMARY KEY,
     thread_id TEXT NOT NULL,
     direction "Direction" NOT NULL,
     from_addr TEXT NOT NULL,
     to_addr TEXT NOT NULL,
     cc_addr TEXT,
     subject TEXT NOT NULL,
     body_text TEXT,
     body_html TEXT,
     message_id TEXT NOT NULL,
     in_reply_to TEXT,
     "references" TEXT,
     provider_id TEXT,
     status "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
     attachments JSONB,
     opened_at TIMESTAMPTZ,
     clicked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT email_messages_thread_fk FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_messages_message_id_key ON email_messages(message_id)`,
  `CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages(thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS email_messages_provider_idx ON email_messages(provider_id)`,
  // v561：客服信箱支援 LINE 通道(LINE 客人訊息進信箱、後台可直接回)
  `ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS channel VARCHAR(8) NOT NULL DEFAULT 'email'`,
  `ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(64)`,
  `ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS channel VARCHAR(8) NOT NULL DEFAULT 'email'`,
  `CREATE INDEX IF NOT EXISTS email_threads_line_idx ON email_threads(line_user_id)`,
  `CREATE TABLE IF NOT EXISTS suppressed_emails (
     email TEXT PRIMARY KEY,
     reason TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // v531：收信紀錄（每次讀 Gmail 記一筆）
  `CREATE TABLE IF NOT EXISTS email_poll_logs (
     id TEXT PRIMARY KEY,
     trigger TEXT NOT NULL,
     scanned INTEGER NOT NULL DEFAULT 0,
     ingested INTEGER NOT NULL DEFAULT 0,
     dedup INTEGER NOT NULL DEFAULT 0,
     skipped INTEGER NOT NULL DEFAULT 0,
     ok BOOLEAN NOT NULL DEFAULT true,
     error TEXT,
     ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS email_poll_logs_ran_idx ON email_poll_logs(ran_at DESC)`,
  // v532：已刪除訊息墓碑（後台刪掉的信，記住 Message-ID，避免下次收信又收回來）
  `CREATE TABLE IF NOT EXISTS email_deleted_msgids (
     message_id TEXT PRIMARY KEY,
     deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // v577：每日訪客計數（只存每天聚合總數，不存訪客身分）
  `CREATE TABLE IF NOT EXISTS daily_stats (
     date VARCHAR(10) PRIMARY KEY,
     views INT NOT NULL DEFAULT 0,
     visitors INT NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // v584：每小時訪客計數（後台「近 24 小時」活動圖）
  `CREATE TABLE IF NOT EXISTS hourly_stats (
     hour VARCHAR(13) PRIMARY KEY,
     views INT NOT NULL DEFAULT 0,
     visitors INT NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // v580：Google OAuth 連線（GA4 唯讀 refresh token）
  `CREATE TABLE IF NOT EXISTS google_oauth (
     provider VARCHAR(16) PRIMARY KEY,
     refresh_token TEXT NOT NULL,
     property_id VARCHAR(32),
     connected_by VARCHAR(64),
     connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // v590：節慶優惠代碼
  `CREATE TABLE IF NOT EXISTS promo_codes (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     code VARCHAR(16) NOT NULL UNIQUE,
     discount_type VARCHAR(12) NOT NULL,
     discount_value INT NOT NULL,
     start_at TIMESTAMPTZ NOT NULL,
     end_at TIMESTAMPTZ NOT NULL,
     is_public BOOLEAN NOT NULL DEFAULT TRUE,
     applies_to VARCHAR(8) NOT NULL DEFAULT 'daily',
     min_amount INT NOT NULL DEFAULT 0,
     per_user_limit INT NOT NULL DEFAULT 0,
     total_limit INT NOT NULL DEFAULT 0,
     used_count INT NOT NULL DEFAULT 0,
     audience_tag VARCHAR(24),
     enabled BOOLEAN NOT NULL DEFAULT TRUE,
     note TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes(code)`,
  // v590：日潛早鳥回饋（site_config）
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS early_bird_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS early_bird_min_amount INT NOT NULL DEFAULT 1000`,
  `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS early_bird_tiers JSONB NOT NULL DEFAULT '[]'`,
  // v590：訂單記錄優惠 / 早鳥
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code VARCHAR(16)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_discount INT NOT NULL DEFAULT 0`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS early_bird_credit INT NOT NULL DEFAULT 0`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS early_bird_granted BOOLEAN NOT NULL DEFAULT FALSE`,
  // v592：抵用金批次扣抵「先用最近到期」
  `ALTER TABLE credit_txs ADD COLUMN IF NOT EXISTS consumed_amount INT NOT NULL DEFAULT 0`,
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
