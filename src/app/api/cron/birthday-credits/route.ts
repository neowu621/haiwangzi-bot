import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────
// /api/cron/birthday-credits
// ─────────────────────────────────────────────────────────────
//
// v388：改為「每月 1 日 00:00（台灣時間）跑一次」。
//   找出「生日落在當月」的人，發放 SiteConfig.birthdayCreditAmount 的抵用金。
//   透過 user.birthdayCreditYear 確保「一年只發一次」（即使中途重跑也不重發）。
//   ※ 註冊當月生日者，於 Email 驗證通過時即時補發（見 src/lib/signup-reward.ts）；
//     兩條路徑共用 birthdayCreditYear 去重，不會重複發放。
//
// Cronicle 排程：0 0 1 * *（每月 1 號 00:00，台灣時區）
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
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // v409：dryRun 預覽模式 — 只統計「本月有幾位要補、預計發多少」，不實際發放。
  //   用法：?dryRun=1（或 ?dry=1），仍需帶 Bearer。
  const sp = req.nextUrl.searchParams;
  const dryRun = sp.get("dryRun") === "1" || sp.get("dry") === "1";

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const amount = cfg?.birthdayCreditAmount ?? 100;
  // v184：生日抵用金有效天數（0 = 永不過期）
  const expiryDays = cfg?.birthdayCreditExpiryDays ?? 360;
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

  // v388：抓「生日月份 = 當月」且今年還沒發過的 user（不再比對 day）。
  //   一年一次的保證來自 birthday_credit_year；於月初 1 號統一發放。
  const users = await prisma.$queryRaw<
    Array<{
      line_user_id: string;
      display_name: string | null;
      birthday: Date | null;
      birthday_credit_year: number | null;
    }>
  >`
    SELECT line_user_id, display_name, birthday, birthday_credit_year
    FROM users
    WHERE birthday IS NOT NULL
      AND deleted_at IS NULL
      AND EXTRACT(MONTH FROM birthday) = ${month}
      AND (birthday_credit_year IS NULL OR birthday_credit_year < ${year})
    ORDER BY EXTRACT(DAY FROM birthday)
  `;

  // v409：預覽模式 — 回傳明細但不發放
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      date: `${month}/${day}/${year}`,
      month,
      amount,
      expiryDays,
      eligibleCount: users.length,
      totalAmount: users.length * amount,
      users: users.map((u) => {
        const b = u.birthday ? new Date(u.birthday) : null;
        const id = u.line_user_id || "";
        return {
          name: u.display_name || "(無名)",
          birthday: b ? `${b.getUTCMonth() + 1}/${b.getUTCDate()}` : null,
          lastGrantedYear: u.birthday_credit_year,
          userId: id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "",
        };
      }),
    });
  }

  const granted: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  for (const u of users) {
    try {
      // v184：算出到期日（expiryDays = 0 → 永不過期）
      const expiresAt =
        expiryDays > 0
          ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
          : null;
      await grantCredit({ skipNotify: true,
        userId: u.line_user_id,
        amount,
        reason: "birthday",
        refType: "birthday",
        refId: String(year),
        note: expiryDays > 0
          ? `${year} 生日抵用金（${expiryDays} 天內有效）`
          : `${year} 生日抵用金`,
        expiresAt,
      });
      // 標記今年已發
      await prisma.user.update({
        where: { lineUserId: u.line_user_id },
        data: { birthdayCreditYear: year },
      });
      granted.push(u.line_user_id);
      // v420：通知壽星「生日禮金到帳」（birthday_credit 模板）
      const { notifyCustomer } = await import("@/lib/notify-template");
      const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
      // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
      notifyCustomer({
        userId: u.line_user_id,
        templateKey: "birthday_credit",
        params: { amount, expiryDays, liffUrl },
      });
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
