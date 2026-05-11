# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps ────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# --include=dev：強制裝 dev deps（避免 Zeabur 平台帶 NODE_ENV=production 進來導致 npm ci 跳過 dev 套件）
RUN npm ci --include=dev --no-audit --no-fund

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
RUN apk add --no-cache libc6-compat openssl
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
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
