// v912：首頁「本週潛水精選」推播給會員 —— 站內為主 + 可加 Email。
//   mode:"preview" 只回人數與訊息；"send" 才真的發。7 天鎖一次（防洗版）。testSelf 只發自己。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { DEFAULT_DIVE_VIDEOS, sanitizeDiveVideos, ytThumb, ytWatchUrl, type DiveVideo } from "@/lib/dive-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUSH_LOCK_DAYS = 7;

const Schema = z.object({
  channels: z.array(z.enum(["inapp", "email"])).min(1),
  audience: z.enum(["all", "active30", "vip5"]),
  mode: z.enum(["preview", "send"]),
  testSelf: z.boolean().optional(),
});

function audienceWhere(audience: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { deletedAt: null, blacklisted: false };
  if (audience === "vip5") return { ...base, vipLevel: { gte: 5 } };
  if (audience === "active30") return { ...base, lastActiveAt: { gte: new Date(Date.now() - 30 * 86400000) } };
  return base; // all
}

function buildMessage(vids: DiveVideo[]) {
  const latest = vids.find((v) => v.category === "latest") ?? vids[0];
  const bestCount = vids.filter((v) => v !== latest).length;
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");
  const title = "🎬 本週潛水精選上線！";
  const lines = [
    "汪汪這週幫你挑好片了 🌊",
    latest ? `🆕 ${latest.title}` : "",
    latest?.desc ? latest.desc : "",
    bestCount > 0 ? `還有 ${bestCount} 支近期最佳精選！` : "",
    "想一起下水嗎？點下方看本週場次 👇",
  ].filter(Boolean);
  const body = lines.join("\n");
  return { title, body, latest, bestCount, base };
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "格式錯誤" }, { status: 400 });
  const { channels, audience, mode, testSelf } = parsed.data;

  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  const stored = sanitizeDiveVideos((cfg as unknown as { featuredDiveVideos?: unknown } | null)?.featuredDiveVideos);
  const vids = stored.length > 0 ? stored : DEFAULT_DIVE_VIDEOS;
  const lastPushAt = (cfg as unknown as { diveVideoLastPushAt?: Date | null } | null)?.diveVideoLastPushAt ?? null;
  const canSendAt = lastPushAt ? new Date(new Date(lastPushAt).getTime() + PUSH_LOCK_DAYS * 86400000) : null;
  const locked = !testSelf && !!canSendAt && canSendAt.getTime() > Date.now();

  const { title, body, latest, base } = buildMessage(vids);

  const targets = testSelf
    ? await prisma.user.findMany({ where: { lineUserId: auth.user.lineUserId } })
    : await prisma.user.findMany({ where: audienceWhere(audience) });
  const emailTargets = channels.includes("email") ? targets.filter((t) => t.notifyByEmail && t.email) : [];

  if (mode === "preview") {
    return NextResponse.json({
      count: targets.length,
      inapp: channels.includes("inapp") ? targets.length : 0,
      email: emailTargets.length,
      preview: { title, body },
      lastPushAt,
      canSendAt,
      locked,
    });
  }

  // 7 天鎖
  if (locked) {
    return NextResponse.json(
      { error: `距上次推播未滿 ${PUSH_LOCK_DAYS} 天，${canSendAt!.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })} 後才能再推（避免洗版）。` },
      { status: 429 },
    );
  }

  const bookingLink = "/liff/booking?tab=calendar";
  const result = { inapp: 0, email: 0 };

  // ── 站內（一律送達，不看 opt-in）──
  if (channels.includes("inapp")) {
    const rows = targets.map((t) => ({
      userId: t.lineUserId, templateKey: "dive_video_blast", title, body,
      linkUrl: bookingLink, buttonLabel: "看本週場次", icon: "🎬",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      try { await prisma.notification.createMany({ data: chunk }); result.inapp += chunk.length; }
      catch (e) { console.error("[dive-video push inapp]", e); }
    }
  }

  // ── Email（選配）──
  if (emailTargets.length > 0 && emailConfigured() && latest) {
    const thumb = ytThumb(latest.id);
    const watch = ytWatchUrl(latest.id);
    for (const u of emailTargets) {
      if (!u.email) continue;
      const html = `<div style="font-family:'Microsoft JhengHei',sans-serif;max-width:600px;font-size:15px;line-height:1.75;color:#1a2430">
        <h2 style="color:#0a2342;margin:0 0 10px">${title}</h2>
        <p>${(u.realName ?? u.displayName ?? "潛水夥伴")} 你好 👋 汪汪這週幫你挑了幾支好片，海裡正精彩：</p>
        <a href="${watch}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e6ebf0;border-radius:10px;overflow:hidden;margin:12px 0">
          <img src="${thumb}" alt="" style="width:100%;display:block" />
          <div style="padding:11px 13px"><b style="font-size:15px">🆕 ${latest.title}</b>${latest.desc ? `<div style="color:#5a6b7d;font-size:13px;margin-top:3px">${latest.desc}</div>` : ""}</div>
        </a>
        <p style="margin:16px 0"><a href="${base}/d" style="display:inline-block;background:#0b8f86;color:#fff;padding:11px 22px;border-radius:9px;text-decoration:none;font-weight:700">🤿 看本週場次 →</a></p>
        <p style="color:#8090a0;font-size:12px;margin:0">跟著汪汪一起下水，東北角海王子潛水團 🔱</p>
      </div>`;
      const r = await sendEmail({ to: u.email, subject: `🎬 本週潛水精選 — ${latest.title}`, text: `${title}\n${body}\n${watch}`, html });
      if (r.ok) result.email += 1;
    }
  }

  // 記錄推播時間（啟動 7 天鎖）
  if (!testSelf) {
    await prisma.siteConfig.update({
      where: { id: "default" },
      data: { diveVideoLastPushAt: new Date() } as never,
    }).catch((e) => console.error("[dive-video push stamp]", e));
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "dive_video.push",
    targetType: "dive_video",
    metadata: { audience, channels, testSelf: !!testSelf, ...result },
  });

  return NextResponse.json({ ok: true, ...result });
}
