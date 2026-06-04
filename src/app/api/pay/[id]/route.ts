// v296：公開付款 API（無需 LINE 登入），用 ?t=<token> 驗證
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

interface PaymentInfo {
  bank?: { name?: string; branch?: string; account?: string; holder?: string };
  linepay?: { qrUrl?: string; liteId?: string };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAY_LINK_EXPIRY_DAYS = 30;

async function loadBookingByToken(id: string, token: string) {
  if (!id || !token) return null;
  // 同時 match id + token，避免有人列出所有 booking id
  const b = await prisma.booking.findFirst({
    where: { id, payLinkToken: token },
    include: {
      paymentProofs: {
        select: {
          id: true,
          type: true,
          amount: true,
          uploadedAt: true,
          verifiedAt: true,
        },
        orderBy: { uploadedAt: "desc" },
      },
    },
  });
  return b;
}

function isExpired(createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs > PAY_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

// GET /api/pay/[id]?t=<token>
//   回傳訂單摘要 + 付款方式設定 + 狀態
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";

  const booking = await loadBookingByToken(id, token);
  if (!booking) {
    return NextResponse.json(
      { error: "invalid_link", message: "連結無效或已過期" },
      { status: 404 },
    );
  }

  // 已被 admin 確認 → 連結失效（只回 view-only 資料）
  if (booking.payLinkVerifiedAt) {
    return NextResponse.json({
      state: "verified",
      booking: {
        id: booking.id,
        code: booking.code,
        type: booking.type,
        participants: booking.participants,
        totalAmount: booking.totalAmount,
        paidAmount: booking.paidAmount,
        paymentStatus: booking.paymentStatus,
        status: booking.status,
        verifiedAt: booking.payLinkVerifiedAt,
      },
    });
  }

  // 連結過期（建立後 30 天）
  if (isExpired(booking.createdAt)) {
    return NextResponse.json(
      { error: "expired", message: "此付款連結已過期（超過 30 天）" },
      { status: 410 },
    );
  }

  // 取場次詳情
  let refDetail: Record<string, unknown> | null = null;
  if (booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({
      where: { id: booking.refId },
      select: { date: true, startTime: true, diveSiteIds: true },
    });
    if (trip) {
      const sites = await prisma.diveSite.findMany({
        where: { id: { in: trip.diveSiteIds } },
        select: { id: true, name: true },
      });
      const siteMap = new Map(sites.map((s) => [s.id, s.name]));
      refDetail = {
        date: trip.date.toISOString().slice(0, 10),
        startTime: trip.startTime,
        sites: trip.diveSiteIds.map((sid) => siteMap.get(sid) ?? sid),
      };
    }
  } else if (booking.type === "tour") {
    const tour = await prisma.tourPackage.findUnique({
      where: { id: booking.refId },
      select: { title: true, dateStart: true, dateEnd: true, diveSiteIds: true },
    });
    if (tour) {
      const sites = await prisma.diveSite.findMany({
        where: { id: { in: tour.diveSiteIds } },
        select: { id: true, name: true },
      });
      const siteMap = new Map(sites.map((s) => [s.id, s.name]));
      refDetail = {
        title: tour.title,
        dateStart: tour.dateStart.toISOString().slice(0, 10),
        dateEnd: tour.dateEnd.toISOString().slice(0, 10),
        sites: tour.diveSiteIds.map((sid) => siteMap.get(sid) ?? sid),
      };
    }
  }

  // 取付款方式設定
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  const paymentInfo: PaymentInfo =
    (cfg?.paymentInfo as PaymentInfo | null) ?? {};
  const bank = {
    name: paymentInfo.bank?.name ?? process.env.BANK_NAME ?? "",
    branch: paymentInfo.bank?.branch ?? process.env.BANK_BRANCH ?? "",
    account: paymentInfo.bank?.account ?? process.env.BANK_ACCOUNT ?? "",
    holder: paymentInfo.bank?.holder ?? process.env.BANK_HOLDER ?? "",
  };
  const linepay = {
    qrUrl: paymentInfo.linepay?.qrUrl ?? "",
    liteId: paymentInfo.linepay?.liteId ?? "",
  };

  // 已上傳的付款證明（不暴露 imageKey / R2 url）
  const proofs = booking.paymentProofs.map((p) => ({
    id: p.id,
    type: p.type,
    amount: p.amount,
    uploadedAt: p.uploadedAt,
    verifiedAt: p.verifiedAt,
  }));

  return NextResponse.json({
    state: "active",
    booking: {
      id: booking.id,
      code: booking.code,
      type: booking.type,
      participants: booking.participants,
      totalAmount: booking.totalAmount,
      depositAmount: booking.depositAmount,
      paidAmount: booking.paidAmount,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      paymentMethod: booking.paymentMethod,
      ref: refDetail,
      createdAt: booking.createdAt,
    },
    bank,
    linepay,
    proofs,
  });
}

// POST /api/pay/[id]?t=<token>  — 上傳付款證明（公開，不需 LIFF）
const BodySchema = z
  .object({
    paymentMethod: z.enum(["bank", "linepay", "other"]),
    amount: z.number().int().min(1),
    r2Key: z.string().min(1).optional(),
    imageDataUrl: z.string().min(20).optional(),
    last5: z.string().regex(/^\d{5}$/).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.paymentMethod === "bank" && !d.last5) {
      ctx.addIssue({ code: "custom", path: ["last5"], message: "轉帳付款需填寫匯款帳號後 5 碼" });
    }
    if (d.paymentMethod === "linepay" && !d.r2Key && !d.imageDataUrl) {
      ctx.addIssue({ code: "custom", path: ["r2Key"], message: "LINE Pay 付款需上傳轉帳截圖" });
    }
    if (d.paymentMethod === "other" && !d.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "其他付款方式需填寫說明" });
    }
  });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";

  const booking = await loadBookingByToken(id, token);
  if (!booking) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  if (booking.payLinkVerifiedAt) {
    return NextResponse.json({ error: "already_verified" }, { status: 410 });
  }
  if (isExpired(booking.createdAt)) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // 簡單 rate limit（防爆破/濫上傳）— 用 bookingId 限制每分鐘 5 次
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const limited = checkRateLimit(req, {
    scope: "pay-upload",
    identifier: id,
    windowMs: 60_000,
    max: 5,
  });
  if (limited) return limited;
  const ip = "anon"; // 用於 log，不參與 rate limit 計算

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 防止上傳金額超過應付餘額
  const remaining = booking.totalAmount - booking.paidAmount;
  if (data.amount > remaining + 100) {
    return NextResponse.json(
      { error: "amount_exceeds_remaining", remaining },
      { status: 400 },
    );
  }

  const imageKey = data.r2Key ?? data.imageDataUrl ?? null;

  try {
    await prisma.paymentProof.create({
      data: {
        bookingId: id,
        type: booking.paymentStatus === "fully_paid" ? "final" : (booking.type === "tour" && booking.paidAmount < booking.depositAmount ? "deposit" : "final"),
        amount: data.amount,
        imageKey,
        last5: data.last5 ?? null,
        note: data.note ?? null,
      },
    });
    // 同步 booking.paymentMethod
    await prisma.booking.update({
      where: { id },
      data: {
        paymentMethod: data.paymentMethod,
        ...(data.note ? { paymentNote: data.note } : {}),
      },
    });

    // pending → awaiting_verify
    if (booking.status === "pending") {
      await prisma.booking.update({
        where: { id },
        data: { status: "awaiting_verify" },
      });
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus: "pending",
          toStatus: "awaiting_verify",
          actorId: null,
          actorRole: "customer",
          note: `公開連結上傳付款證明（IP: ${ip}）`,
        }),
      );
    }

    // 推 LINE 給 admin/boss
    void (async () => {
      try {
        const { getLineClient } = await import("@/lib/line");
        const lineClient = getLineClient();
        if (!lineClient) return;
        const admins = await prisma.user.findMany({
          where: {
            OR: [
              { role: "admin" },
              { role: "boss" },
              { roles: { has: "admin" } },
              { roles: { has: "boss" } },
            ],
            notifyByLine: true,
          },
          select: { lineUserId: true },
        });
        const customerName = booking.code;
        const methodLabel = { bank: "🏦 轉帳", linepay: "💚 LINE Pay", other: "📝 其他" }[data.paymentMethod];
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app";
        const text = `💰 待確認付款（公開連結）\n\n訂單 ${customerName}\n方式：${methodLabel}\n金額：NT$ ${data.amount.toLocaleString()}\n${data.last5 ? `後 5 碼：${data.last5}\n` : ""}${data.note ? `備註：${data.note}\n` : ""}\n請至後台審核：${baseUrl}/admin/bookings?status=awaiting_verify`;
        for (const a of admins) {
          try {
            await lineClient.pushMessage({
              to: a.lineUserId,
              messages: [{ type: "text", text }],
            });
          } catch (e) {
            console.error("[pay/[id] push admin]", e);
          }
        }
      } catch (e) {
        console.error("[pay/[id] notify admin]", e);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/pay/[id]]", e);
    return NextResponse.json(
      { error: "create_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
