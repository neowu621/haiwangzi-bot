#!/usr/bin/env node
/**
 * 把指定 lineUserId 設為 admin 角色
 *
 * 用法：
 *   node scripts/set-admin.js <lineUserId>
 *
 * 範例：
 *   node scripts/set-admin.js Ub3b6ae9367a43ea5f7c90f7e8aa49d38
 *
 * 需要 .env 設好 DATABASE_URL（指向要操作的 DB）
 */
'use strict';

const { PrismaClient } = require('@prisma/client');

async function main() {
  const lineUserId = process.argv[2];
  if (!lineUserId) {
    console.error('用法: node scripts/set-admin.js <lineUserId>');
    console.error('  例: node scripts/set-admin.js Ub3b6ae9367a43ea5f7c90f7e8aa49d38');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      console.error(`❌ 找不到 user lineUserId=${lineUserId}`);
      console.error('   （請確認該人已加入 LINE OA + 進過 LIFF 一次）');
      process.exit(1);
    }

    const before = user.role;
    const updated = await prisma.user.update({
      where: { lineUserId },
      data: { role: 'admin', roles: ['admin'] },
    });

    console.log('✅ 已升級為 admin');
    console.log(`   lineUserId : ${lineUserId}`);
    console.log(`   displayName: ${updated.displayName}`);
    console.log(`   realName   : ${updated.realName ?? '—'}`);
    console.log(`   role       : ${before} → admin`);
  } catch (e) {
    console.error('❌ 失敗:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
