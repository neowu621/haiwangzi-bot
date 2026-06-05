import { NextRequest, NextResponse } from "next/server";
import type { WebhookEvent } from "@line/bot-sdk";
import { getLineClient, verifyLineSignature } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { buildFlexByKey } from "@/lib/flex";
import { genMemberCode } from "@/lib/code-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!accessToken || !secret) {
    return NextResponse.json({ error: "LINE env not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: { events: WebhookEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  await Promise.allSettled(body.events.map(handleEvent));
  return NextResponse.json({ ok: true });
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  const userId =
    event.source.type === "user" ? event.source.userId : undefined;

  switch (event.type) {
    case "follow":
      if (userId) await handleFollow(userId, event.replyToken);
      break;

    case "unfollow":
      if (userId) await handleUnfollow(userId);
      break;

    case "message":
      // v343：移除關鍵字自動回覆。客戶傳訊只更新「最後活躍時間」，不自動回覆
      //   （由老闆/教練親自回覆，或 LINE 官方帳號的自動回應設定處理）
      if (userId) await touchUserActivity(userId);
      break;

    case "postback":
      // Phase 2 Rich Menu/quick reply 才用
      console.log(`[webhook] postback: ${event.postback.data}`);
      break;

    default:
      console.log(`[webhook] skip event type=${event.type}`);
  }
}

async function handleFollow(userId: string, replyToken: string): Promise<void> {
  const client = getLineClient();

  // 抓 LINE profile
  let displayName = `User ${userId.slice(0, 8)}`;
  try {
    const profile = await client.getProfile(userId);
    displayName = profile.displayName ?? displayName;
  } catch (err) {
    console.warn("[webhook] getProfile failed", err);
  }

  // upsert User (容錯：DB 失敗也不擋歡迎訊息)
  try {
    const existing = await prisma.user.findUnique({ where: { lineUserId: userId } });
    const code = existing ? undefined : await genMemberCode();
    await prisma.user.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, displayName, ...(code && { code }) },
      update: { displayName, lastActiveAt: new Date() },
    });
  } catch (err) {
    console.error("[webhook handleFollow] upsert failed", err);
  }

  // 歡迎 Flex（取代純文字）
  // v233：fallback chain — LINE_LIFF_ID → NEXT_PUBLIC_LIFF_ID → BASE_URL
  // 之前只讀 NEXT_PUBLIC_LIFF_ID，造成 LIFF ID 在 LINE_LIFF_ID 設好時 URL 仍是空的 → 按鈕無反應
  const liffId = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  const liffUrl = liffId
    ? `https://liff.line.me/${liffId}`
    : process.env.NEXT_PUBLIC_BASE_URL ?? "https://liff.line.me";
  const welcomeMsg = buildFlexByKey(
    "welcome",
    { liffUrl, displayName },
    `歡迎加入${process.env.NEXT_PUBLIC_APP_NAME ?? ""}`,
  );
  await client.replyMessage({
    replyToken,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [welcomeMsg as any],
  });
}

async function handleUnfollow(userId: string): Promise<void> {
  // 不刪 user (可能還有訂單),只記錄
  console.log(`[webhook] user unfollowed: ${userId}`);
}

// v343：客戶傳訊只記錄活躍時間，不自動回覆
async function touchUserActivity(userId: string): Promise<void> {
  await prisma.user.update({
    where: { lineUserId: userId },
    data: { lastActiveAt: new Date() },
  }).catch(async () => {
    // user 不存在就 upsert（帶會員編號）
    const code = await genMemberCode().catch(() => undefined);
    return prisma.user.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, displayName: `User ${userId.slice(0, 8)}`, ...(code && { code }) },
      update: {},
    });
  });
}
