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

// v923：改「每天挑一則」 → 同一天只推一則(台北時區)，隔天可再推。
const Schema = z.object({
  videoId: z.string().optional(), // 要推的那一則(不給 → 用第一支)
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

const taipeiDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

// v923：單一影片訊息 —— 帶影片連結，客戶點了直接看
function buildMessage(video: DiveVideo) {
  const watch = ytWatchUrl(video.id);
  const title = "🎬 今日精選潛水影片";
  const body = [video.title, video.desc || "", "點下方看影片 👇"].filter(Boolean).join("\n");
  return { title, body, watch };
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "格式錯誤" }, { status: 400 });
  const { videoId, channels, audience, mode, testSelf } = parsed.data;

  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  const stored = sanitizeDiveVideos((cfg as unknown as { featuredDiveVideos?: unknown } | null)?.featuredDiveVideos);
  const vids = stored.length > 0 ? stored : DEFAULT_DIVE_VIDEOS;
  // 要推的那一則：指定 videoId → 找它；否則用「本週最新」或第一支
  const video = (videoId ? vids.find((v) => v.id === videoId) : null) ?? vids.find((v) => v.category === "latest") ?? vids[0];
  if (!video) return NextResponse.json({ error: "沒有可推播的影片" }, { status: 400 });

  const lastPushAt = (cfg as unknown as { diveVideoLastPushAt?: Date | null } | null)?.diveVideoLastPushAt ?? null;
  const todayStr = taipeiDay(new Date());
  const lastDay = lastPushAt ? taipeiDay(new Date(lastPushAt)) : null;
  const locked = !testSelf && lastDay === todayStr; // 同一天已推 → 鎖(每天一則)

  const { title, body, watch } = buildMessage(video);

  const targets = testSelf
    ? await prisma.user.findMany({ where: { lineUserId: auth.user.lineUserId } })
    : await prisma.user.findMany({ where: audienceWhere(audience) });
  const emailTargets = channels.includes("email") ? targets.filter((t) => t.notifyByEmail && t.email) : [];

  if (mode === "preview") {
    return NextResponse.json({
      count: targets.length,
      inapp: channels.includes("inapp") ? targets.length : 0,
      email: emailTargets.length,
      preview: { title, body, videoTitle: video.title, watch },
      lastPushAt,
      locked,
    });
  }

  // 每天一則鎖
  if (locked) {
    return NextResponse.json(
      { error: "今天已經推過一則了，明天再推（每天最多一則，避免洗版）。" },
      { status: 429 },
    );
  }

  const result = { inapp: 0, email: 0 };
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");

  // ── 站內（一律送達，不看 opt-in）—— linkUrl 直接指向 YouTube 影片
  if (channels.includes("inapp")) {
    const rows = targets.map((t) => ({
      userId: t.lineUserId, templateKey: "dive_video_blast", title, body,
      linkUrl: watch, buttonLabel: "▶ 看影片", icon: "🎬",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      try { await prisma.notification.createMany({ data: chunk }); result.inapp += chunk.length; }
      catch (e) { console.error("[dive-video push inapp]", e); }
    }
  }

  // ── Email（選配）── 帶影片縮圖 + 連結
  if (emailTargets.length > 0 && emailConfigured()) {
    const thumb = ytThumb(video.id);
    for (const u of emailTargets) {
      if (!u.email) continue;
      const html = `<div style="font-family:'Microsoft JhengHei',sans-serif;max-width:600px;font-size:15px;line-height:1.75;color:#1a2430">
        <h2 style="color:#0a2342;margin:0 0 10px">${title}</h2>
        <p>${(u.realName ?? u.displayName ?? "潛水夥伴")} 你好 👋 汪汪今天幫你挑了一支好片：</p>
        <a href="${watch}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e6ebf0;border-radius:10px;overflow:hidden;margin:12px 0">
          <img src="${thumb}" alt="" style="width:100%;display:block" />
          <div style="padding:11px 13px"><b style="font-size:15px">${video.title}</b>${video.desc ? `<div style="color:#5a6b7d;font-size:13px;margin-top:3px">${video.desc}</div>` : ""}</div>
        </a>
        <p style="margin:14px 0"><a href="${watch}" style="display:inline-block;background:#c4302b;color:#fff;padding:10px 20px;border-radius:9px;text-decoration:none;font-weight:700">▶ 看影片</a>　<a href="${base}/d" style="display:inline-block;background:#0b8f86;color:#fff;padding:10px 20px;border-radius:9px;text-decoration:none;font-weight:700">🤿 看場次</a></p>
        <p style="color:#8090a0;font-size:12px;margin:0">跟著汪汪一起下水，東北角海王子潛水團 🔱</p>
      </div>`;
      const r = await sendEmail({ to: u.email, subject: `🎬 今日精選 — ${video.title}`, text: `${title}\n${body}\n${watch}`, html });
      if (r.ok) result.email += 1;
    }
  }

  // 記錄推播時間（啟動當天鎖）
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
    metadata: { videoId: video.id, videoTitle: video.title, audience, channels, testSelf: !!testSelf, ...result },
  });

  return NextResponse.json({ ok: true, ...result });
}
