import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { authFromRequest, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIFF_ID = process.env.LINE_LIFF_ID ?? "";
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

// 每個 role 對應的 Rich Menu 結構：6 格 2×3
// 客戶版佈局：
//   [日潛水]      [潛水團]     [最新動態]
//   [我的預約]    [FB 社群]    [個人中心]
async function richMenuSpec(role: "customer" | "coach" | "admin") {
  const linkFor = (p: string) =>
    LIFF_ID
      ? { type: "uri" as const, uri: `https://liff.line.me/${LIFF_ID}${p}` }
      : { type: "message" as const, text: p };

  const externalLink = (uri: string) => ({ type: "uri" as const, uri });

  // 從 SiteConfig 讀外部連結（env 為 fallback，避免初次部署時 DB 還沒值）
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const links = (cfg?.externalLinks as Record<string, string> | null) ?? {};
  const fbGroupUrl = links.fbGroupUrl || process.env.NEXT_PUBLIC_FB_GROUP_URL || "";
  const mediaUrl = links.mediaUrl || ""; // 沒設時 fallback 到內部 /liff/media

  const cells = {
    customer: [
      // 第一列
      { action: linkFor("/calendar"), label: "日潛水 → 今日出航" },
      { action: linkFor("/tour"), label: "潛水團 → 國內外行程" },
      { action: linkFor("/faq"), label: "常見問題 → FAQ / 退款政策 / VIP 福利" },
      // 第二列
      { action: linkFor("/my"), label: "我的預約 → 課程紀錄" },
      {
        action: fbGroupUrl ? externalLink(fbGroupUrl) : linkFor("/welcome"),
        label: "FB 社群專區 → Facebook Group（或 IG 等社群）",
      },
      { action: linkFor("/profile"), label: "個人中心 → 潛水紀錄" },
    ] as Array<{ action: { type: "uri"; uri: string } | { type: "message"; text: string }; label: string }>,
    coach: [
      { path: "/coach/today", text: "📅 今日場次" },
      { path: "/coach/schedule", text: "📋 排班" },
      { path: "/coach/payment", text: "💳 收款核對" },
      { path: "/coach/today", text: "🌊 海況" },
      { path: "/coach/today", text: "👥 我的學員" },
      { path: "/coach/today", text: "📣 推播" },
    ],
    admin: [
      { path: "/admin/dashboard", text: "🛠 模板" },
      { path: "/admin/bookings", text: "📋 排班/場次" },
      { path: "/admin/reports", text: "📊 報表" },
      { path: "/coach/payment", text: "💳 訂金/尾款" },
      { path: "/admin/broadcast", text: "📣 群發" },
      { path: "/admin/settings", text: "⚙️ 設定" },
    ],
  };

  const list = cells[role];
  const areaW = 2500 / 3;
  const areaH = 1686 / 2;
  const areas = list.map((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const bounds = {
      x: Math.round(col * areaW),
      y: Math.round(row * areaH),
      width: Math.round(areaW),
      height: Math.round(areaH),
    };
    // customer 新版用 c.action（含外連 FB Group），其他 role 沿用 linkFor(c.path)
    if ("action" in c) {
      return { bounds, action: c.action };
    }
    return { bounds, action: linkFor(c.path) };
  });

  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: `海王子-${role}`,
    chatBarText:
      role === "customer" ? "🤿 海王子" : role === "coach" ? "👨‍🏫 教練" : "⚙ 後台",
    areas,
  };
}

// POST /api/admin/richmenu/sync?role=customer
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  if (!ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const target = (url.searchParams.get("role") ?? "customer") as
    | "customer"
    | "coach"
    | "admin";

  const spec = await richMenuSpec(target);

  // 1. 建立 rich menu (取得 richMenuId)
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(spec),
  });
  if (!createRes.ok) {
    return NextResponse.json(
      { error: "create failed", detail: await createRes.text() },
      { status: 500 },
    );
  }
  const { richMenuId } = (await createRes.json()) as { richMenuId: string };

  // 2. 上傳圖 — 優先 .jpg（檔案小、品質夠），fallback 到 .png
  let imgPath = path.join(process.cwd(), "public", "richmenu", `${target}.jpg`);
  let contentType = "image/jpeg";
  if (!fs.existsSync(imgPath)) {
    imgPath = path.join(process.cwd(), "public", "richmenu", `${target}.png`);
    contentType = "image/png";
  }
  if (!fs.existsSync(imgPath)) {
    return NextResponse.json(
      {
        error: "圖片不存在",
        hint: `請放 public/richmenu/${target}.jpg 或 .png（2500×1686, < 1 MB）`,
      },
      { status: 500 },
    );
  }
  const imgBuf = fs.readFileSync(imgPath);
  if (imgBuf.length > 1024 * 1024) {
    return NextResponse.json(
      {
        error: `圖片過大 (${(imgBuf.length / 1024).toFixed(0)} KB)，LINE 限制 1 MB`,
      },
      { status: 400 },
    );
  }
  const uploadRes = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": contentType,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: imgBuf as any,
    },
  );
  if (!uploadRes.ok) {
    return NextResponse.json(
      { error: "upload failed", detail: await uploadRes.text() },
      { status: 500 },
    );
  }

  // 3. 設為 default (只對 customer 設 default；coach/admin 用 link 個別綁定)
  if (target === "customer") {
    const setDefaultRes = await fetch(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      },
    );
    if (!setDefaultRes.ok) {
      return NextResponse.json(
        { error: "set default failed", detail: await setDefaultRes.text() },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, richMenuId, role: target });
}
