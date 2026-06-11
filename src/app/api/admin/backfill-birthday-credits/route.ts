import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v390：一次性補發「生日抵用金」給「生日月份已到/當月、今年尚未領取」的現有會員。
//   - 金額讀 SiteConfig.birthdayCreditAmount（0 = 不發、直接 skip）
//   - 只補「生日月 <= 台灣當月」者；未來月份生日交給月初 cron（/api/cron/birthday-credits）自動發
//   - 去重：與 cron 共用 birthday_credit_year（一年只發一次），可重複呼叫（idempotent）
//   - 權限：admin / boss
// GET  → dry-run，回報「會補發幾位、總額多少」但不實際發放
// POST → 實際補發
async function run(req: NextRequest, dryRun: boolean) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const amount = cfg?.birthdayCreditAmount ?? 100;
  const expiryDays = cfg?.birthdayCreditExpiryDays ?? 360;

  if (amount <= 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "birthdayCreditAmount=0（請先在系統設定填入金額）",
    });
  }

  // 用台灣時區算當月（Zeabur node 通常 UTC，台灣 UTC+8）
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = tw.getUTCMonth() + 1; // 1-12
  const year = tw.getUTCFullYear();

  // 生日月 <= 當月、且今年還沒領過的會員（未來月份生日不在此補，交給月初 cron）
  const users = await prisma.$queryRaw<
    Array<{ line_user_id: string; name: string | null; birthday: Date | null }>
  >`
    SELECT line_user_id, COALESCE(real_name, display_name) AS name, birthday
    FROM users
    WHERE birthday IS NOT NULL
      AND deleted_at IS NULL
      AND EXTRACT(MONTH FROM birthday) <= ${month}
      AND (birthday_credit_year IS NULL OR birthday_credit_year < ${year})
  `;

  // v441：預覽名單除了姓名也顯示生日日期（生日是 @db.Date，用 UTC 取月/日避免時區偏移）
  const bday = (d: Date | null) => {
    if (!d) return "—";
    const b = new Date(d);
    return `${b.getUTCMonth() + 1}/${b.getUTCDate()}`;
  };

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      amount,
      year,
      eligibleCount: users.length,
      totalCredit: users.length * amount,
      members: users.map((u) => `${u.name ?? "（未命名）"}（生日 ${bday(u.birthday)}）`),
    });
  }

  const expiresAt =
    expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : null;
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
        note:
          expiryDays > 0
            ? `${year} 生日抵用金（補發・${expiryDays} 天內有效）`
            : `${year} 生日抵用金（補發）`,
        createdBy: auth.user.lineUserId,
        expiresAt,
      });
      await prisma.user.update({
        where: { lineUserId: u.line_user_id },
        data: { birthdayCreditYear: year },
      });
      // v442：比照 cron 通知壽星「生日禮金到帳」（birthday_credit 模板，尊重會員 LINE/Email/站內開關）
      const { notifyCustomer } = await import("@/lib/notify-template");
      const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
      // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
      notifyCustomer({
        userId: u.line_user_id,
        templateKey: "birthday_credit",
        params: { amount, expiryDays, liffUrl },
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
    `[backfill birthday] year=${year} granted=${granted.length} failed=${failed.length} amount=${amount}`,
  );
  return NextResponse.json({
    ok: true,
    amount,
    year,
    grantedCount: granted.length,
    failedCount: failed.length,
    totalCredit: granted.length * amount,
    failed,
  });
}

export async function GET(req: NextRequest) {
  return run(req, true);
}
export async function POST(req: NextRequest) {
  return run(req, false);
}
