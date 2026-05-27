#!/bin/sh
set -e

# Use db push (no migration files needed; schema is the source of truth)
# 安全：對既有 DB 不會 destroy 資料；first boot 自動建表
echo "[entrypoint] Syncing Prisma schema (db push)..."
node ./node_modules/prisma/build/index.js db push --skip-generate || echo "[entrypoint] WARNING: db push failed — schema may need manual reconcile (set DATABASE_URL & re-deploy, or run db push --accept-data-loss manually)"

# 補發所有缺少編號的舊資料（冪等：只處理 code IS NULL 的記錄）
echo "[entrypoint] Backfilling codes for existing data..."
node scripts/backfill-codes.js || echo "[entrypoint] WARNING: backfill-codes failed (non-fatal)"

echo "[entrypoint] Starting server..."
exec node server.js
