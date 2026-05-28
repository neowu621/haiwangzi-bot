import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reset-data/system-initial
 *
 * 「系統初始重置」— 把系統回到剛部署的狀態，**保留**：
 *   - 會員資料（User）
 *   - 系統設定（SiteConfig，例如品牌名稱、Hero 文字、裝備費率等）
 *
 * **清除**：
 *   - 所有營運資料（訂單/場次/潛水團/付款憑證/教練/潛點/...）
 *   - 會員的衍生欄位（vipLevel/totalSpend/creditBalance/birthdayCreditYear 歸零）
 *   - 操作紀錄、訊息範本、提醒紀錄、媒體照片
 *
 * 僅限 admin/boss，需要在 body 帶 confirm 字串
 * Body: { confirm: "RESET TO INITIAL" }
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== "RESET TO INITIAL") {
    return NextResponse.json(
      { error: "confirm 字串不符，請傳入 { confirm: 'RESET TO INITIAL' }" },
      { status: 400 },
    );
  }

  // 依 FK 依存關係由葉子節點往上刪
  // 全部用 transaction，任一失敗整體 rollback
  const result = await prisma.$transaction(async (tx) => {
    // 1. 葉子表（依賴 Booking / Trip / Tour）
    const paymentProofs = await tx.paymentProof.deleteMany({});
    const reminderLogs = await tx.reminderLog.deleteMany({});
    const tripPhotos = await tx.tripPhoto.deleteMany({});
    const tripMedia = await tx.tripMedia.deleteMany({});

    // 2. 訂單 + 場次 + 潛水團
    const bookings = await tx.booking.deleteMany({});
    const trips = await tx.divingTrip.deleteMany({});
    const tours = await tx.tourPackage.deleteMany({});

    // 3. 系統營運設定（教練、潛點）
    const coaches = await tx.coach.deleteMany({});
    const sites = await tx.diveSite.deleteMany({});

    // 4. 會員衍生資料（保留 User，清掉禮金紀錄並重設衍生欄位）
    const creditTxs = await tx.creditTx.deleteMany({});
    const userReset = await tx.user.updateMany({
      data: {
        vipLevel: 1,
        totalSpend: 0,
        creditBalance: 0,
        birthdayCreditYear: null,
      },
    });

    // 5. 訊息範本 + 操作紀錄（保留最近紀錄前的 audit 條目可選）
    const templates = await tx.messageTemplate.deleteMany({});
    const audits = await tx.auditLog.deleteMany({});

    return {
      paymentProofs: paymentProofs.count,
      reminderLogs: reminderLogs.count,
      tripPhotos: tripPhotos.count,
      tripMedia: tripMedia.count,
      bookings: bookings.count,
      trips: trips.count,
      tours: tours.count,
      coaches: coaches.count,
      sites: sites.count,
      creditTxs: creditTxs.count,
      usersReset: userReset.count,
      templates: templates.count,
      audits: audits.count,
    };
  });

  // 寫一筆新的 audit（在 transaction 之外，否則會被剛刪除的 transaction 包含）
  await logAudit({
    actorId: auth.lineUserId,
    actorName: auth.user.displayName,
    action: "data.reset_to_initial",
    targetType: "system",
    targetId: "all",
    targetLabel: "系統初始重置（保留會員資料 + SiteConfig）",
    metadata: result,
  });

  return NextResponse.json({ ok: true, deleted: result });
}
