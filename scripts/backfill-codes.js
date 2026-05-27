#!/usr/bin/env node
/**
 * 補發所有缺少編號的舊資料
 * 格式：{P}{YYYYMMDD}-{XX}  (P=M/D/T/O, XX=base-36 2位)
 * 在 docker-entrypoint.sh 中 prisma db push 之後執行
 * 每次只處理 code IS NULL 的記錄，已有編號的不動
 */
"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function formatDateTW(date) {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function randomSuffix() {
  return (
    CHARS[Math.floor(Math.random() * 36)] +
    CHARS[Math.floor(Math.random() * 36)]
  );
}

async function genCode(prefix, dateStr, checkExists) {
  for (let i = 0; i < 50; i++) {
    const code = `${prefix}${dateStr}-${randomSuffix()}`;
    if (!(await checkExists(code))) return code;
  }
  throw new Error(`Cannot generate unique ${prefix} code for ${dateStr}`);
}

async function main() {
  let updated = 0;
  let errors = 0;

  // ── 會員 ───────────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { code: null },
    select: { lineUserId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    try {
      const code = await genCode(
        "M",
        formatDateTW(u.createdAt),
        async (c) => !!(await prisma.user.findUnique({ where: { code: c } }))
      );
      await prisma.user.update({ where: { lineUserId: u.lineUserId }, data: { code } });
      updated++;
    } catch (e) {
      console.error("[backfill] user error:", e.message);
      errors++;
    }
  }

  // ── 日潛場次 ───────────────────────────────────────────────────────────────
  const trips = await prisma.divingTrip.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const t of trips) {
    try {
      const code = await genCode(
        "D",
        formatDateTW(t.createdAt),
        async (c) => !!(await prisma.divingTrip.findUnique({ where: { code: c } }))
      );
      await prisma.divingTrip.update({ where: { id: t.id }, data: { code } });
      updated++;
    } catch (e) {
      console.error("[backfill] trip error:", e.message);
      errors++;
    }
  }

  // ── 潛水團 ─────────────────────────────────────────────────────────────────
  const tours = await prisma.tourPackage.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const t of tours) {
    try {
      const code = await genCode(
        "T",
        formatDateTW(t.createdAt),
        async (c) => !!(await prisma.tourPackage.findUnique({ where: { code: c } }))
      );
      await prisma.tourPackage.update({ where: { id: t.id }, data: { code } });
      updated++;
    } catch (e) {
      console.error("[backfill] tour error:", e.message);
      errors++;
    }
  }

  // ── 訂單 ───────────────────────────────────────────────────────────────────
  const bookings = await prisma.booking.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const b of bookings) {
    try {
      const code = await genCode(
        "O",
        formatDateTW(b.createdAt),
        async (c) => !!(await prisma.booking.findUnique({ where: { code: c } }))
      );
      await prisma.booking.update({ where: { id: b.id }, data: { code } });
      updated++;
    } catch (e) {
      console.error("[backfill] booking error:", e.message);
      errors++;
    }
  }

  if (updated > 0 || errors > 0) {
    console.log(`[backfill-codes] updated=${updated} errors=${errors}`);
  } else {
    console.log("[backfill-codes] All records already have codes, nothing to do.");
  }
}

main()
  .catch((e) => {
    console.error("[backfill-codes] Fatal:", e.message);
    // 非 fatal — 不 exit(1)，讓 server 繼續啟動
  })
  .finally(() => prisma.$disconnect());
