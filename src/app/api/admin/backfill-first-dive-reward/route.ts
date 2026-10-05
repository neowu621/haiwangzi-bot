import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { maybeGrantFirstOrderReward } from "@/lib/first-order-reward";
import { parseExclusions, logExclusions } from "@/lib/backfill-exclude"; // v1081

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1080：補發「首潛獎勵」給『已完成首次潛水、Email 已驗證、但系統當時沒發出來』的會員。
//
//   為什麼需要補發：首潛獎勵的觸發點是「教練勾到場」那一刻（lib/first-order-reward.ts）。
//   那一刻若剛好：客戶還沒驗證 Email、金額設定是 0、或發放當下出錯，獎勵就不會發出，
//   而且之後沒有任何機制會再試一次 —— 客戶永遠拿不到那 100 元。
//
//   ⚠️ 關鍵：首潛獎勵的「一帳號一次」是靠 user.firstOrderRewardGrantedAt 這個旗標控管，
//      不是只看 CreditTx。所以這裡不自己寫發放邏輯，直接複用 maybeGrantFirstOrderReward，
//      由它一次把 CreditTx、旗標、通知都處理掉 —— 自己重寫一份最可能漏掉旗標，
//      那會變成「每按一次補發就多送一次錢」。
//
//   - 金額/效期讀 SiteConfig.firstOrderRewardAmount / firstOrderRewardExpiryDays
//   - 冪等：發過的人 firstOrderRewardGrantedAt 已有值，再跑一次會被跳過
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
    (cfg as unknown as { firstOrderRewardAmount?: number } | null)
      ?.firstOrderRewardAmount ?? 0;

  if (amount <= 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "firstOrderRewardAmount=0（請先在系統設定填入金額）",
    });
  }

  // 有「完成到場」紀錄、卻還沒領過首潛獎勵的會員。
  //   firstOrderRewardGrantedAt 是權威旗標；順便擋掉已有 first_order_reward 交易的
  //   （理論上兩者同步，但萬一旗標被人工清掉，這層還能擋住重複發放）。
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      firstOrderRewardGrantedAt: null,
      creditTxs: { none: { reason: "first_order_reward" } },
      bookings: { some: { status: "completed" } },
    },
    select: {
      lineUserId: true,
      realName: true,
      displayName: true,
      emailVerifiedAt: true,
      bookings: {
        where: { status: "completed" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  // Email 沒驗證就拿不到（首潛獎勵的硬性條件）。
  //   這種人分開算 —— 他們潛過水、符合資格，只差一步驗證，
  //   老闆看到數字才知道「有幾個人卡在這裡」可以去推一把。
  const ready = candidates.filter((c) => c.emailVerifiedAt && c.bookings.length > 0);
  const blockedByEmail = candidates.filter((c) => !c.emailVerifiedAt);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      amount,
      eligibleCount: ready.length,
      totalCredit: ready.length * amount,
      // v1081：帶 userId —— 前端要能逐人排除
      members: ready.map((c) => ({ userId: c.lineUserId, name: c.realName ?? c.displayName ?? "（未命名）" })),
      // 額外資訊：潛過水但卡在沒驗證 Email 的人數（這次發不出去）
      blockedByEmailCount: blockedByEmail.length,
      blockedByEmailMembers: blockedByEmail.map((c) => c.realName ?? c.displayName ?? "（未命名）"),
      // 這批不是「可發但被排除」，是硬性條件沒過，所以不給 userId（沒有排除的意義）
    });
  }

  // v1081：老闆在預覽名單上按「刪」排除的人（附原因，寫進稽核紀錄）
  const exclusions = parseExclusions(await req.json().catch(() => ({})));
  const excluded = new Set(exclusions.map((e) => e.userId));
  const targets = ready.filter((u) => !excluded.has(u.lineUserId));
  if (exclusions.length > 0) {
    await logExclusions({
      kind: "first_order_reward",
      kindLabel: "首潛獎勵",
      exclusions,
      nameOf: (id) => {
        const u = ready.find((x) => x.lineUserId === id);
        return u?.realName ?? u?.displayName ?? undefined;
      },
      actorId: auth.user.lineUserId,
      actorName: auth.user.realName ?? auth.user.displayName,
    });
  }

  const granted: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];
  for (const u of targets) {
    const bookingId = u.bookings[0]?.id;
    if (!bookingId) continue;
    try {
      // retroactive: true —— 跳過「必須是第一筆完成訂單」檢查。
      //   這些人當初卡住時可能已經又潛了幾次，但獎勵仍只發一次（旗標控管）。
      const r = await maybeGrantFirstOrderReward(u.lineUserId, bookingId, { retroactive: true });
      if (r.granted) granted.push(u.lineUserId);
      else failed.push({ userId: u.lineUserId, error: r.reason ?? "未發放（原因不明）" });
    } catch (e) {
      failed.push({
        userId: u.lineUserId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `[backfill first-dive-reward] granted=${granted.length} failed=${failed.length} amount=${amount}`,
  );
  return NextResponse.json({
    ok: true,
    amount,
    grantedCount: granted.length,
    failedCount: failed.length,
    excludedCount: exclusions.length, // v1081
    totalCredit: granted.length * amount,
    blockedByEmailCount: blockedByEmail.length,
    failed,
  });
}

export async function GET(req: NextRequest) {
  return run(req, true);
}
export async function POST(req: NextRequest) {
  return run(req, false);
}
