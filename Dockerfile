# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps ────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# --include=dev：強制裝 dev deps（避免 Zeabur 平台帶 NODE_ENV=production 進來導致 npm ci 跳過 dev 套件）
RUN npm ci --include=dev --no-audit --no-fund
# npm optionalDependencies 已知 bug：lockfile 在 Windows 產生時，Alpine(musl) 的
#   原生二進位有機率整包沒被裝進來 —— build 期才炸，且是機率性的
#   (v1072 首次部署即掛在 "Cannot find module '../lightningcss.linux-x64-musl.node'"，
#    同一份 lockfile 上一版卻建得起來)。這裡逐一驗證 build 會用到的原生模組，
#   缺了就照 lockfile 的版本補裝，讓部署不再看運氣。
RUN for m in lightningcss @tailwindcss/oxide; do \
      node -e "require('$m')" 2>/dev/null && continue; \
      v=$(node -p "require('/app/node_modules/$m/package.json').version"); \
      echo "[deps] $m 原生檔缺失，補裝 $m-linux-x64-musl@$v"; \
      npm install --no-save --no-audit --no-fund "$m-linux-x64-musl@$v" || exit 1; \
    done

# ─── Stage 2: build ───────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────
FROM node:22-alpine AS runner
# postgresql18-client 提供 pg_dump（DB 備份 cron 用，需與 Zeabur Postgres 18.x 版本相符）
RUN apk add --no-cache libc6-compat openssl postgresql18-client
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 非 root 使用者
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# 先裝 Prisma CLI（含完整 transitive deps：@prisma/config / effect …）。
# 必須在 COPY @prisma 之前，否則 npm 看到目錄已存在就不會解析它的 deps。
RUN npm install --no-save --no-audit --no-fund prisma@6.19.3 @prisma/client@6.19.3
# 把 builder 生成的 prisma client (含 query engines binary) 覆蓋上去
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY scripts/ ./scripts/
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
