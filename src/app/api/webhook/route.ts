import { NextRequest, NextResponse } from "next/server";
import type { WebhookEvent } from "@line/bot-sdk";
import { getLineClient, verifyLineSignature } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { buildFlexByKeyAsync } from "@/lib/flex";
import { notifyCustomer } from "@/lib/notify-template";
import { genMemberCode } from "@/lib/code-gen";
import { ingestLineMessage } from "@/lib/line-inbound";

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

  // v563：診斷 log —— 確認 LINE 有把事件送來、簽章是否通過
  console.log(`[webhook] 收到 POST，body 長度=${rawBody.length}，有簽章=${!!signature}`);

  if (!verifyLineSignature(rawBody, signature)) {
    console.warn("[webhook] 簽章驗證失敗(LINE_CHANNEL_SECRET 可能不符)→ 401");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: { events: WebhookEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  console.log(`[webhook] 簽章 OK，事件數=${body.events.length}，類型=[${body.events.map((e) => e.type).join(",")}]`);
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
      // v343：不自動回覆;v561：文字訊息收進客服信箱(channel=line),老闆在後台可直接回
      if (userId) {
        await touchUserActivity(userId);
        if (event.message.type === "text") {
          try {
            const u = await prisma.user.findUnique({ where: { lineUserId: userId }, select: { displayName: true } });
            await ingestLineMessage({ lineUserId: userId, displayName: u?.displayName, text: event.message.text, lineMessageId: event.message.id });
            console.log(`[webhook] LINE 文字訊息已收進客服信箱(from ${userId.slice(0, 8)}…)`);
          } catch (e) {
            console.error("[webhook] ingestLineMessage failed", e);
          }
        } else {
          console.log(`[webhook] 非文字訊息(type=${event.message.type}),略過 ingest`);
        }
      }
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
  // v480：改 async 版 — 套後台 override（標題/副標/說明/按鈕/通知列文字）
  const welcomeMsg = await buildFlexByKeyAsync(
    "welcome",
    { liffUrl, displayName },
    `歡迎加入${process.env.NEXT_PUBLIC_APP_NAME ?? ""}`,
  );
  await client.replyMessage({
    replyToken,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [welcomeMsg as any],
  });
  // v480：LINE 已用 reply 發送 → 補 Email/站內通知（模板組稿，skipLine 避免重發）
  notifyCustomer({
    userId,
    templateKey: "welcome",
    params: { liffUrl, displayName },
    skipLine: true,
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
