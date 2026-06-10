import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { publicUrl, isPrivate, type R2Prefix } from "@/lib/r2";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334
import { notifyAdmins } from "@/lib/message-log"; // v473：站內通知管理者

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// v228：允許上到 10MB（fallback 用 base64 時放大圖片才不會被擋）
export const maxDuration = 60;

// v289：付款方式選擇移到此頁，依方式不同必填欄位也不同
//  - paymentMethod (必填) bank / linepay / other
//  - r2Key / imageDataUrl 圖片（linepay 必填，bank/other 選填）
//  - last5  bank 必填、其他不需要
//  - note   other 必填說明、bank/linepay 選填
const BodySchema = z.object({
  type: z.enum(["deposit", "final", "refund"]),
  amount: z.number().int().min(1),
  paymentMethod: z.enum(["bank", "linepay", "other"]),
  r2Key: z.string().min(1).optional(),
  imageDataUrl: z.string().min(20).optional(),
  thumbBase64: z.string().max(60000).optional(), // v379：~160px 縮圖 base64（存 DB）
  last5: z.string().regex(/^\d{5}$/).optional(),
  note: z.string().max(500).optional(),
}).superRefine((d, ctx) => {
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

// POST /api/bookings/:id/payment-proofs
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your booking" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // v297：先擋已付清 / 已退款 / 已取消的訂單（友善文案）
  if (booking.paymentStatus === "fully_paid" ||
      (booking.totalAmount > 0 && booking.paidAmount >= booking.totalAmount)) {
    return NextResponse.json(
      { error: "此訂單已付清 ✅，無需再上傳付款證明。如有問題請聯絡老闆" },
      { status: 400 },
    );
  }
  if (booking.paymentStatus === "refunded" || booking.paymentStatus === "refunding") {
    return NextResponse.json(
      { error: "此訂單為退款狀態，無法再上傳付款證明" },
      { status: 400 },
    );
  }
  if (booking.status === "cancelled_by_user" || booking.status === "cancelled_by_weather" ||
      booking.status === "cancelled_unpaid") {
    return NextResponse.json(
      { error: "此訂單已取消，無法再上傳付款證明" },
      { status: 400 },
    );
  }
  // 防止上傳金額超過餘額（給 100 容差）
  const remaining = booking.totalAmount - booking.paidAmount;
  if (data.amount > remaining + 100) {
    return NextResponse.json(
      {
        error: `上傳金額 NT$${data.amount.toLocaleString()} 超過應付餘額 NT$${remaining.toLocaleString()}。若實際多付請聯絡老闆`,
      },
      { status: 400 },
    );
  }

  // v300：精簡 DB 寫入流程（從 4-5 次降到 2 次），避免冷啟動超時
  //   1. 一次性 booking.update（paymentMethod + paymentNote + status 變化）
  //   2. paymentProof.create
  //   3. log + LINE 通知都改成 fire-and-forget
  const imageKey = data.r2Key ?? data.imageDataUrl ?? null;
  const shouldTransitionStatus = booking.status === "pending";
  const fromStatus = booking.status;

  let proof;
  try {
    // 並行：booking 更新 + proof 建立（無依賴關係）
    const [, createdProof] = await Promise.all([
      prisma.booking.update({
        where: { id },
        data: {
          paymentMethod: data.paymentMethod,
          ...(data.note ? { paymentNote: data.note } : {}),
          ...(shouldTransitionStatus ? { status: "awaiting_verify" } : {}),
        },
      }),
      prisma.paymentProof.create({
        data: {
          bookingId: id,
          type: data.type,
          amount: data.amount,
          imageKey,
          thumbBase64: data.thumbBase64 ?? null, // v379：縮圖存 DB
          last5: data.last5 ?? null,
          note: data.note ?? null,
        },
      }),
    ]);
    proof = createdProof;
  } catch (e) {
    console.error("[POST payment-proofs]", e);
    return NextResponse.json(
      { error: "create failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // v473：站內通知所有管理者（可在 LIFF 個人中心確認）
  notifyAdmins({
    templateKey: "payment_proof_uploaded",
    title: "💳 新付款證明待核對",
    body: `訂單 ${id.slice(0, 8)} 上傳了${data.type === "deposit" ? "訂金" : data.type === "final" ? "尾款" : ""}付款證明，金額 NT$${data.amount}、後5碼 ${data.last5 ?? "—"}，請進後台核對。`,
    linkUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz"}/admin/bookings`,
    icon: "💳",
  });

  // v300：log + LINE 通知都改 fire-and-forget，不擋 response
  try {
    if (shouldTransitionStatus) {
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus,
          toStatus: "awaiting_verify",
          actorId: auth.user.lineUserId,
          actorRole: "customer",
          note: `上傳付款證明（金額 NT$${data.amount}、後5碼 ${data.last5}）`,
        }),
      );
    }
    // 推 LINE 給 admin/boss（fire-and-forget）
    void (async () => {
      try {
        const { getLineClient } = await import("@/lib/line");
        const lineClient = getLineClient();
        if (!lineClient) return;
        const admins = await prisma.user.findMany({
          where: {
            OR: [
              { role: "admin" }, { role: "boss" },
              { roles: { has: "admin" } }, { roles: { has: "boss" } },
            ],
            notifyByLine: true,
          },
          select: { lineUserId: true },
        });
        // v300: 不再 findUnique，需要時自己查
        const u = await prisma.user.findUnique({
          where: { lineUserId: booking.userId },
          select: { realName: true, displayName: true },
        }).catch(() => null);
        const customerName = u?.realName ?? u?.displayName ?? "客戶";
        const methodLabel = { bank: "🏦 轉帳", linepay: "💚 LINE Pay", other: "📝 其他" }[data.paymentMethod];
        const text = `💰 待確認付款\n\n${customerName} 上傳付款證明\n訂單 #${id.slice(0, 8)}\n方式：${methodLabel}\n金額：NT$ ${data.amount.toLocaleString()}\n${data.last5 ? `後 5 碼：${data.last5}\n` : ""}${data.note ? `備註：${data.note}\n` : ""}\n請至後台審核：${process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.xyz"}/admin/bookings?status=awaiting_verify`;
        for (const a of admins) {
          try {
            await lineClient.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] });
          } catch (e) {
            console.error("[push admin payment-proof]", e);
          }
        }
      } catch (e) {
        console.error("[notify admin awaiting_verify]", e);
      }
    })();
  } catch (e) {
    console.error("[awaiting_verify transition]", e);
  }

  // 若 booking 是 tour 類型，重新計算 paidAmount = sum(deposit/final 驗證過的)
  // 此處先不在客戶上傳時自動標 paid，等教練「滑動確認」才更新

  // 只在 R2 key 屬於公開 bucket prefix 才回 publicUrl；
  // private prefix (payments/...) 的應該走 /api/uploads/preview presigned GET
  let pubUrl: string | null = null;
  if (data.r2Key) {
    const prefix = data.r2Key.split("/")[0] as R2Prefix;
    pubUrl = isPrivate(prefix) ? null : publicUrl(data.r2Key);
  }

  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.payment_proof.upload",
    targetType: "booking",
    targetId: id,
    targetLabel: booking.code ?? undefined,
    metadata: {
      amount: data.amount,
      type: data.type,
      last5: data.last5 ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    proof: {
      id: proof.id,
      type: proof.type,
      amount: proof.amount,
      publicUrl: pubUrl,
      uploadedAt: proof.uploadedAt,
    },
  });
}
