// v592：節慶優惠發送精靈 —— 預覽人數 → 確認發送(LINE / Email / 內部訊息)。
//   mode:"preview" 只回人數;"send" 才真的發。testSelf 只發給自己(測試)。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  promoId: z.string(),
  channels: z.array(z.enum(["line", "email", "inapp"])).min(1),
  audience: z.enum(["all", "vip5", "hasEmail", "active30"]),
  mode: z.enum(["preview", "send"]),
  testSelf: z.boolean().optional(),
});

function audienceWhere(audience: string): Prisma.UserWhereInput {
  if (audience === "vip5") return { vipLevel: { gte: 5 } };
  if (audience === "hasEmail") return { email: { not: null }, emailVerifiedAt: { not: null } };
  if (audience === "active30") return { lastActiveAt: { gte: new Date(Date.now() - 30 * 86400000) } };
  return {}; // all
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "格式錯誤" }, { status: 400 });
  const { promoId, channels, audience, mode, testSelf } = parsed.data;

  const promo = await prisma.promoCode.findUnique({ where: { id: promoId } });
  if (!promo) return NextResponse.json({ error: "查無此優惠檔" }, { status: 404 });

  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz").replace(/\/$/, "");
  const label = promo.discountType === "per_tank" ? `每支氣瓶 −$${promo.discountValue}` : `訂單 −${promo.discountValue}%`;
  const end = new Date(promo.endAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const title = `🎏 ${promo.title}`;
  const bodyText = `${label}！優惠碼 ${promo.code}（至 ${end} 止）\n下單時輸入即可折抵。立即預約 → ${base}`;

  // 對象
  const targets = testSelf
    ? await prisma.user.findMany({ where: { lineUserId: auth.user.lineUserId } })
    : await prisma.user.findMany({ where: audienceWhere(audience) });

  const lineTargets = channels.includes("line") ? targets.filter((t) => t.notifyByLine) : [];
  const emailTargets = channels.includes("email") ? targets.filter((t) => t.notifyByEmail && t.email) : [];

  if (mode === "preview") {
    return NextResponse.json({
      count: targets.length,
      line: lineTargets.length,
      email: emailTargets.length,
      inapp: channels.includes("inapp") ? targets.length : 0,
      preview: { title, body: bodyText },
    });
  }

  // ── 實際發送 ──
  const result = { line: 0, email: 0, inapp: 0 };

  if (lineTargets.length > 0 && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    const client = getLineClient();
    const ids = lineTargets.map((t) => t.lineUserId);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      try {
        await client.multicast({ to: chunk, messages: [{ type: "text", text: `${title}\n${bodyText}` }] });
        result.line += chunk.length;
      } catch (e) { console.error("[promo send line]", e); }
    }
  }

  if (emailTargets.length > 0 && emailConfigured()) {
    for (const u of emailTargets) {
      if (!u.email) continue;
      const html = `<div style="font-family:'Microsoft JhengHei',sans-serif;font-size:15px;line-height:1.8;color:#0f2430"><h2 style="color:#0a2342">${title}</h2><p>${label}！</p><p>優惠碼 <b style="font-family:monospace">${promo.code}</b>（至 ${end} 止）<br>下單時輸入即可折抵。</p><p><a href="${base}" style="display:inline-block;background:#0a8f86;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">立即預約 →</a></p></div>`;
      const r = await sendEmail({ to: u.email, subject: `${promo.title}優惠｜優惠碼 ${promo.code}`, text: `${title}\n${bodyText}`, html });
      if (r.ok) result.email += 1;
    }
  }

  if (channels.includes("inapp")) {
    await prisma.notification.createMany({
      data: targets.map((t) => ({ userId: t.lineUserId, templateKey: "promo_blast", title, body: bodyText, linkUrl: base, icon: "🎏" })),
    });
    result.inapp = targets.length;
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "promo.send",
    targetType: "promo",
    targetId: promo.id,
    metadata: { code: promo.code, audience, channels, testSelf: !!testSelf, ...result },
  });

  return NextResponse.json({ ok: true, ...result });
}
