import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { buildFlexByKeyAsync, type FlexTemplateKey } from "@/lib/flex";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { broadcastEmail } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v649：多選對象 —— 角色群組 + 單一客戶 + 日潛/潛旅參加者，最後用 lineUserId 去重(同一人只發一次)
const AudienceKey = z.enum(["all", "customers", "staff", "mgmt", "single", "daily", "tour"]);
const BodySchema = z.object({
  // 可複選；空陣列時 fallback 舊欄位 audience（向後相容）
  audiences: z.array(AudienceKey).default([]),
  audience: z.enum(["all", "customers", "coaches", "admins", "single", "trip"]).optional(), // 舊版相容
  // single 用：指定 LINE userId
  singleUserId: z.string().optional(),
  // 日潛/潛旅參加者
  dailyRefId: z.string().optional(),
  tourRefId: z.string().optional(),
  // 舊版 trip 相容
  refType: z.enum(["daily", "tour"]).optional(),
  refId: z.string().optional(),
  template: z.string(),
  altText: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  text: z.string().optional(), // 純文字模式（template = "text" 時使用）
  // 通道：line / email / both
  channel: z.enum(["line", "email", "both"]).default("line"),
  // Email 專用欄位
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
});

// POST /api/admin/broadcast
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = BodySchema.parse(await req.json());

  // v649：把舊版單一 audience 正規化成多選陣列(向後相容)
  const audiences = new Set<string>(data.audiences);
  if (audiences.size === 0 && data.audience) {
    const map: Record<string, string> = { all: "all", customers: "customers", coaches: "staff", admins: "mgmt", single: "single", trip: data.refType === "tour" ? "tour" : "daily" };
    audiences.add(map[data.audience] ?? "customers");
    if (data.audience === "single") data.singleUserId = data.singleUserId;
    if (data.audience === "trip") { if (data.refType === "tour") data.tourRefId = data.refId; else data.dailyRefId = data.refId; }
  }
  const has = (k: string) => audiences.has(k);

  // 收集所有命中的 lineUserId（Set 去重 → 同一人只發一次）
  const idSet = new Set<string>();

  if (has("all")) {
    const us = await prisma.user.findMany({ where: { deletedAt: null }, select: { lineUserId: true } });
    us.forEach((u) => idSet.add(u.lineUserId));
  } else {
    // 角色群組（roles[] 多重身分 + 舊 role 欄位都比對，才不漏人）
    const roleOr: Array<Record<string, unknown>> = [];
    if (has("customers")) roleOr.push({ roles: { has: "customer" } }, { role: "customer" });
    if (has("staff")) roleOr.push({ roles: { hasSome: ["coach", "assistant"] } }, { role: { in: ["coach", "assistant"] } });
    if (has("mgmt")) roleOr.push({ roles: { hasSome: ["boss", "admin", "it"] } }, { role: { in: ["boss", "admin", "it"] } });
    if (roleOr.length > 0) {
      const us = await prisma.user.findMany({ where: { deletedAt: null, OR: roleOr }, select: { lineUserId: true } });
      us.forEach((u) => idSet.add(u.lineUserId));
    }
  }

  // 單一客戶
  if (has("single") && data.singleUserId) idSet.add(data.singleUserId);

  // 日潛 / 潛旅 參加者（活躍訂單）
  const partRefs: Array<{ type: "daily" | "tour"; id: string }> = [];
  if (has("daily") && data.dailyRefId) partRefs.push({ type: "daily", id: data.dailyRefId });
  if (has("tour") && data.tourRefId) partRefs.push({ type: "tour", id: data.tourRefId });
  for (const pr of partRefs) {
    const bookings = await prisma.booking.findMany({
      where: { type: pr.type, refId: pr.id, status: { in: ["pending", "confirmed", "completed"] } },
      select: { userId: true },
    });
    bookings.forEach((b) => idSet.add(b.userId));
  }

  if (idSet.size === 0) {
    return NextResponse.json({ ok: true, delivered: 0, emailed: 0, note: "無符合對象（請確認對象選取）" });
  }

  // 拿完整 user 物件（後面 LINE / Email 都要用）；findMany by 唯一 lineUserId → 自然去重
  // v651：最終一律排除「軟刪除(deletedAt) + 黑名單(blacklisted)」—— 不論來自哪個對象群組都不寄
  const targets = await prisma.user.findMany({
    where: { lineUserId: { in: Array.from(idSet) }, deletedAt: null, blacklisted: false },
  });
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0, emailed: 0, note: "符合對象都被排除（軟刪除/黑名單）" });
  }

  const result: {
    ok: boolean;
    delivered: number;
    emailed: number;
    dryRun?: boolean;
    note?: string;
    channel: string;
  } = {
    ok: true,
    delivered: 0,
    emailed: 0,
    channel: data.channel,
  };

  // ── LINE 通道 ───────────────────────────────────
  if (data.channel === "line" || data.channel === "both") {
    let messages;
    if (data.template === "text") {
      messages = [{ type: "text" as const, text: data.text ?? data.altText }];
    } else {
      // v480：改 async 版 — 套後台 override（標題/說明/按鈕/通知列文字）
      const flex = await buildFlexByKeyAsync(
        data.template as FlexTemplateKey,
        data.params as Record<string, unknown>,
        data.altText,
      );
      messages = [flex];
    }

    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      result.dryRun = true;
      result.note = "LINE_CHANNEL_ACCESS_TOKEN 未設定，LINE 僅 dry-run";
    } else {
      const client = getLineClient();
      // 只發給 opt-in 的 user
      const lineUserIds = targets
        .filter((t) => t.notifyByLine)
        .map((t) => t.lineUserId);

      const chunks: string[][] = [];
      for (let i = 0; i < lineUserIds.length; i += 500)
        chunks.push(lineUserIds.slice(i, i + 500));

      for (const chunk of chunks) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.multicast({ to: chunk, messages: messages as any });
          result.delivered += chunk.length;
        } catch (e) {
          console.error("multicast chunk error", e);
        }
      }
    }
  }

  // ── Email 通道 ───────────────────────────────────
  if (data.channel === "email" || data.channel === "both") {
    if (!emailConfigured()) {
      result.dryRun = true;
      result.note =
        (result.note ? result.note + "; " : "") +
        "Email env (GMAIL_USER/GMAIL_APP_PASSWORD) 未設定，Email 僅 dry-run";
    } else {
      const subject = data.emailSubject?.trim() || data.altText;
      const body = data.emailBody?.trim() || data.text || data.altText;
      const emailRecipients = targets.filter(
        (t) => t.notifyByEmail && t.email,
      );
      for (const u of emailRecipients) {
        if (!u.email) continue;
        const tpl = broadcastEmail({
          name: u.realName ?? u.displayName,
          subject,
          bodyText: body,
        });
        const r = await sendEmail({
          to: u.email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
        if (r.ok) result.emailed += 1;
      }
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "broadcast.send",
    targetType: "broadcast",
    metadata: {
      audiences: Array.from(audiences),
      channel: data.channel,
      template: data.template,
      targets: targets.length,
      singleUserId: data.singleUserId,
      dailyRefId: data.dailyRefId,
      tourRefId: data.tourRefId,
    },
  });
  return NextResponse.json(result);
}
