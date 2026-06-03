import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { publicUrl, isPrivate, type R2Prefix } from "@/lib/r2";

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

  // 防止 client 上傳金額超過 booking 應付金額（避免「假裝多付」干擾 admin）
  const remaining = booking.totalAmount - booking.paidAmount;
  if (data.amount > remaining + 100) {
    // 給 100 NT$ 容差（避免四捨五入問題）
    return NextResponse.json(
      {
        error: `上傳金額 ${data.amount} 超過應付餘額 ${remaining}`,
        hint: "若實際多付，請聯絡客服處理",
      },
      { status: 400 },
    );
  }

  // v238：寫入 imageKey（可選）+ last5 + note；v289：同時更新 booking.paymentMethod / paymentNote
  const imageKey = data.r2Key ?? data.imageDataUrl ?? null;

  let proof;
  try {
    proof = await prisma.paymentProof.create({
      data: {
        bookingId: id,
        type: data.type,
        amount: data.amount,
        imageKey,
        last5: data.last5 ?? null, // v293：DB 欄位本身 nullable，bank 才有真實後 5 碼
        note: data.note ?? null,
      },
    });
    // v289：依本次選擇更新 booking 的付款方式（尾款若改方式就用最新的）
    await prisma.booking.update({
      where: { id },
      data: {
        paymentMethod: data.paymentMethod,
        // 把 note 也寫進 booking.paymentNote（admin 後台看到）；overwrite OK
        ...(data.note ? { paymentNote: data.note } : {}),
      },
    });
  } catch (e) {
    console.error("[POST payment-proofs]", e);
    return NextResponse.json(
      { error: "create failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // v276：客戶上傳付款證明後自動轉狀態 awaiting_verify（pending 才轉，其他狀態保留）
  //  + 推 LINE Flex 給所有 admin/boss 提醒「有匯款待確認」
  try {
    const bk = await prisma.booking.findUnique({
      where: { id },
      include: { user: { select: { realName: true, displayName: true } } },
    });
    if (bk && bk.status === "pending") {
      await prisma.booking.update({
        where: { id },
        data: { status: "awaiting_verify" },
      });
      // v278：log
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus: "pending",
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
        const customerName = bk?.user.realName ?? bk?.user.displayName ?? "客戶";
        const methodLabel = { bank: "🏦 轉帳", linepay: "💚 LINE Pay", other: "📝 其他" }[data.paymentMethod];
        const text = `💰 待確認付款\n\n${customerName} 上傳付款證明\n訂單 #${id.slice(0, 8)}\n方式：${methodLabel}\n金額：NT$ ${data.amount.toLocaleString()}\n${data.last5 ? `後 5 碼：${data.last5}\n` : ""}${data.note ? `備註：${data.note}\n` : ""}\n請至後台審核：${process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app"}/admin/payment-proofs`;
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
