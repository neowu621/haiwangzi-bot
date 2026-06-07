import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v388：一次性補發「註冊禮金」給「已通過 Email 驗證、但尚未領過註冊禮金」的現有會員。
//   - 金額讀 SiteConfig.signupRewardAmount（0 = 不發、直接 skip）
//   - 去重：已有 reason=signup_reward 的 CreditTx 就跳過
//   - 可重複呼叫（idempotent）：第二次跑只會處理新出現的對象
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
  const amount =
    (cfg as unknown as { signupRewardAmount?: number } | null)
      ?.signupRewardAmount ?? 0;
  const days =
    (cfg as unknown as { signupRewardExpiryDays?: number } | null)
      ?.signupRewardExpiryDays ?? 0;

  if (amount <= 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "signupRewardAmount=0（請先在系統設定填入金額）",
    });
  }

  // 已驗證、未刪除、且還沒領過 signup_reward 的會員
  const candidates = await prisma.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      deletedAt: null,
      creditTxs: { none: { reason: "signup_reward" } },
    },
    select: { lineUserId: true, realName: true, displayName: true },
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      amount,
      eligibleCount: candidates.length,
      totalCredit: candidates.length * amount,
    });
  }

  const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000) : null;
  const granted: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];
  for (const u of candidates) {
    try {
      await grantCredit({
        userId: u.lineUserId,
        amount,
        reason: "signup_reward",
        refType: "signup",
        note: "註冊禮金（補發）",
        createdBy: auth.user.lineUserId,
        expiresAt,
      });
      granted.push(u.lineUserId);
    } catch (e) {
      failed.push({
        userId: u.lineUserId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `[backfill signup-reward] granted=${granted.length} failed=${failed.length} amount=${amount}`,
  );
  return NextResponse.json({
    ok: true,
    amount,
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
