import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// /api/cron/birthday-credits
// ─────────────────────────────────────────────────────────────
//
// 每日跑一次（建議台灣時間早上 8 點）。
// 找出今天生日的人，發放 SiteConfig.birthdayCreditAmount 的禮金。
// 透過 user.birthdayCreditYear 紀錄當年是否已發，避免重發。
//
// 認證：Authorization: Bearer <CRON_SECRET>
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const amount = cfg?.birthdayCreditAmount ?? 100;
  if (amount <= 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "amount=0" });
  }

  // 用台灣時區計算今天的 month/day
  // node 在 Zeabur 一般是 UTC，台灣是 UTC+8 → 加 8 小時取日期
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = tw.getUTCMonth() + 1; // 1-12
  const day = tw.getUTCDate();
  const year = tw.getUTCFullYear();

  // Postgres 抓 birthday 月/日 match 的 user，且今年還沒發過
  const users = await prisma.$queryRaw<
    Array<{ line_user_id: string; birthday: Date | null }>
  >`
    SELECT line_user_id, birthday
    FROM users
    WHERE birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = ${month}
      AND EXTRACT(DAY FROM birthday) = ${day}
      AND (birthday_credit_year IS NULL OR birthday_credit_year < ${year})
  `;

  const granted: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  for (const u of users) {
    try {
      await grantCredit({
        userId: u.line_user_id,
        amount,
        reason: "birthday",
        refType: "birthday",
        refId: String(year),
        note: `${year} 生日禮金`,
      });
      // 標記今年已發
      await prisma.user.update({
        where: { lineUserId: u.line_user_id },
        data: { birthdayCreditYear: year },
      });
      granted.push(u.line_user_id);
    } catch (e) {
      failed.push({
        userId: u.line_user_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `[cron birthday-credits] ${month}/${day}/${year}: granted=${granted.length} failed=${failed.length}`,
  );
  return NextResponse.json({
    ok: true,
    date: `${month}/${day}/${year}`,
    amount,
    grantedCount: granted.length,
    failedCount: failed.length,
    granted,
    failed,
  });
}
