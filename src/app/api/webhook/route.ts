import { NextRequest, NextResponse } from "next/server";
import type { WebhookEvent } from "@line/bot-sdk";
import { getLineClient, verifyLineSignature } from "@/lib/line";
import { prisma } from "@/lib/prisma";

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
      if (event.message.type === "text" && userId) {
        await handleTextMessage(userId, event.message.text, event.replyToken);
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

  // upsert User
  await prisma.user.upsert({
    where: { lineUserId: userId },
    create: { lineUserId: userId, displayName },
    update: { displayName, lastActiveAt: new Date() },
  });

  // 歡迎訊息
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text:
          `🤿 歡迎加入海王子潛水團！\n\n` +
          `下方 Rich Menu 直接點選功能：\n` +
          `📅 日潛預約 · 🏝️ 旅行團 · 📋 我的預約\n` +
          `💰 價目 · 👤 我的資料 · 📞 聯絡教練\n\n` +
          `或直接傳「日潛」「旅行團」「我的訂單」「教練」也可快速跳轉。`,
      },
    ],
  });
}

async function handleUnfollow(userId: string): Promise<void> {
  // 不刪 user (可能還有訂單),只記錄
  console.log(`[webhook] user unfollowed: ${userId}`);
}

async function handleTextMessage(
  userId: string,
  text: string,
  replyToken: string,
): Promise<void> {
  const client = getLineClient();
  await prisma.user.update({
    where: { lineUserId: userId },
    data: { lastActiveAt: new Date() },
  }).catch(() => {
    // user 不存在就 upsert
    return prisma.user.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, displayName: `User ${userId.slice(0, 8)}` },
      update: {},
    });
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.zeabur.app";
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  const liffBase = liffId ? `https://liff.line.me/${liffId}` : `${baseUrl}/liff`;

  // 簡單關鍵字 routing,Phase 2 換成 Rich Menu
  if (text.includes("日潛") || text.includes("預約") || text.includes("行事曆")) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `🤿 日潛預約\n${liffBase}/calendar` }],
    });
    return;
  }
  if (text.includes("旅行團") || text.includes("旅遊")) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `🏝️ 旅行團列表\n${liffBase}/tour` }],
    });
    return;
  }
  if (text.includes("我的") || text.includes("訂單")) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `📋 我的預約\n${liffBase}/my` }],
    });
    return;
  }
  if (text.includes("教練") || text.includes("今日")) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `🤿 教練 - 今日場次\n${liffBase}/coach/today` }],
    });
    return;
  }
  if (text.includes("admin") || text === "後台") {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `⚙️ 後台 (僅限 Admin)\n${liffBase}/admin` }],
    });
    return;
  }
  // fallback echo
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text:
          `您說: ${text}\n\n` +
          `試試傳「日潛」「旅行團」「我的訂單」 或 「後台」`,
      },
    ],
  });
}
