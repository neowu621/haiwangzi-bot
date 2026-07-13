// v840：一鍵提醒「Email 沒填 / 沒驗證」的會員去驗證 → 拿註冊禮金（金額讀 signupRewardAmount，預設 50）。
//   GET  → 符合資格筆數 + 預覽名單（姓名 / 原因）。
//   POST → 逐位推 LINE Flex + 站內通知，並蓋 verify_reward_reminded_at（每人只提醒一次；防重複打擾）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { COLORS, flex } from "@/lib/flex/_common";
import type { FlexMessage } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 300;

// email 沒填(null/"") 或 沒驗證(emailVerifiedAt null)，且還沒提醒過、未刪除
const eligibleWhere = {
  deletedAt: null,
  verifyRewardRemindedAt: null,
  OR: [{ email: null }, { email: "" }, { emailVerifiedAt: null }],
};

async function rewardAmount(): Promise<number> {
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  return (cfg as unknown as { signupRewardAmount?: number } | null)?.signupRewardAmount ?? 50;
}

function buildFlex(amount: number, profileUrl: string, altText: string): FlexMessage {
  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box", layout: "vertical", backgroundColor: COLORS.oceanDeep, paddingAll: "20px",
      contents: [
        { type: "text", text: "🎁", align: "center", size: "3xl" },
        { type: "text", text: `驗證 Email 拿 ${amount} 元`, color: "#ffffff", weight: "bold", size: "lg", align: "center", margin: "md" },
      ],
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
      contents: [
        { type: "text", text: `完成 Email 驗證，立刻送你 ${amount} 元抵用金 🪙`, weight: "bold", size: "md", align: "center", wrap: true, color: COLORS.oceanDeep },
        { type: "text", text: "下次潛水可直接折抵，只要 1 分鐘 🙌", size: "sm", align: "center", margin: "md", wrap: true, color: COLORS.mute },
        { type: "text", text: "① 開啟個人資料 → 填 Email\n② 收驗證信點連結 → 完成", size: "xs", margin: "lg", wrap: true, color: COLORS.mute },
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "12px",
      contents: [
        { type: "button", style: "primary", color: COLORS.phosphor, action: { type: "uri", label: `去驗證領 ${amount} 元`, uri: profileUrl } },
      ],
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const eligible = await prisma.user.count({ where: eligibleWhere });
  const rows = await prisma.user.findMany({
    where: eligibleWhere,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { lineUserId: true, realName: true, displayName: true, email: true, emailVerifiedAt: true },
  });
  const list = rows.map((u) => ({
    id: u.lineUserId,
    name: u.realName || u.displayName || "（未命名）",
    reason: !u.email ? "沒填 Email" : "未驗證",
  }));
  return NextResponse.json({ eligible, amount: await rewardAmount(), list, listTruncated: eligible > list.length });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const users = await prisma.user.findMany({
    where: eligibleWhere,
    orderBy: { createdAt: "desc" },
    take: MAX_BATCH,
    select: { lineUserId: true, notifyByLine: true },
  });
  if (users.length === 0) return NextResponse.json({ sent: 0, remaining: 0 });

  const amount = await rewardAmount();
  const liff = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  const profileUrl = `${liff}/profile`;
  const altText = `驗證 Email 拿 ${amount} 元抵用金 🎁`;
  const msg = buildFlex(amount, profileUrl, altText);
  const client = getLineClient();

  let sent = 0;
  for (const u of users) {
    // 1) LINE Flex（有開 LINE 通知才推）
    if (u.notifyByLine && client) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { await client.pushMessage({ to: u.lineUserId, messages: [msg as any] }); } catch (e) { console.error("[verify-reminder push]", u.lineUserId, e); }
    }
    // 2) 站內通知（一律發）
    try {
      await prisma.notification.create({
        data: { userId: u.lineUserId, templateKey: "verify_email_reward", title: altText, body: `完成 Email 驗證，立刻送你 ${amount} 元抵用金 🪙\n開啟個人資料 → 填 Email → 收驗證信點連結完成。`, linkUrl: profileUrl, icon: "🎁" },
      });
    } catch (e) { console.error("[verify-reminder inApp]", u.lineUserId, e); }
    // 3) 蓋章去重（不論成敗都標記，避免重按重發）
    await prisma.user.update({ where: { lineUserId: u.lineUserId }, data: { verifyRewardRemindedAt: new Date() } as never }).catch(() => {});
    sent++;
  }

  const remaining = await prisma.user.count({ where: eligibleWhere });
  return NextResponse.json({ sent, remaining });
}
