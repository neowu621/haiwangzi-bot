#!/bin/sh
set -e

# ─ Step 1: 安全補欄位（冪等）────────────────────────────────────
# 確保 Prisma Client 所需欄位在 DB 中存在，即使 db push 曾靜默失敗。
echo "[entrypoint] Running safety SQL patches..."
node scripts/migrate-safety.js || echo "[entrypoint] WARNING: migrate-safety failed (non-fatal)"

# ─ Step 2: 完整 schema 同步 ─────────────────────────────────────
echo "[entrypoint] Syncing Prisma schema (db push)..."
node ./node_modules/prisma/build/index.js db push --skip-generate || echo "[entrypoint] WARNING: db push failed — schema may need manual reconcile"

# ─ Step 3: 補發所有缺少編號的舊資料（冪等）──────────────────────
echo "[entrypoint] Backfilling codes for existing data..."
node scripts/backfill-codes.js || echo "[entrypoint] WARNING: backfill-codes failed (non-fatal)"

echo "[entrypoint] Starting server..."
exec node server.js
