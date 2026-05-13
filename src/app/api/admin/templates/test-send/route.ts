import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildFlexByKeyAsync, FLEX_TEMPLATES } from "@/lib/flex";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.string(),
});

const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  booking_confirm: {
    name: "（測試）吳俊謀",
    date: "2026-05-13",
    time: "08:00",
    site: "鶯歌石",
    total: 2700,
    url: "https://haiwangzi.zeabur.app/liff/my",
  },
  d1_reminder: {
    date: "2026-05-14",
    time: "08:00",
    site: "深奧",
    weather: "晴",
    wave: "1m",
    water: "24°C",
    vis: "8-12m",
    gather: "深奧漁港停車場 07:30",
  },
  deposit_notice: {
    tourTitle: "蘭嶼四天三夜潛旅 (中秋)",
    deposit: 8000,
    deadline: "2026-09-01",
    bankAccount: "484540139251",
    holder: "汪教練",
    url: "https://haiwangzi.zeabur.app/liff/my",
  },
  deposit_confirm: {
    tourTitle: "蘭嶼四天三夜",
    paid: 8000,
    remaining: 9000,
    finalDeadline: "2026-09-15",
  },
  final_reminder: {
    tourTitle: "蘭嶼四天三夜",
    remaining: 9000,
    deadline: "2026-09-15",
    daysLeft: 3,
    bankAccount: "484540139251",
    url: "https://haiwangzi.zeabur.app/liff/my",
  },
  trip_guide: {
    tourTitle: "蘭嶼四天三夜",
    gather: "高雄港 07:00",
    transport: "中興2號",
    hotel: "蘭嶼背包客棧",
    leader: "汪教練",
    phone: "0988346634",
  },
  weather_cancel: {
    date: "2026-05-13",
    time: "08:00",
    site: "鶯歌石",
    reason: "（測試）今日北風 6 級",
    options: "1. 改期 2. 全額退費",
    url: "https://haiwangzi.zeabur.app/liff/my",
  },
  admin_weekly: {
    weekRange: "2026-05-06 ~ 2026-05-12",
    bookings: 12,
    revenue: 38000,
    cancellations: 1,
    completed: 8,
    topSite: "鶯歌石",
  },
  overcap_alert: {
    tripDate: "2026-05-13",
    tripTime: "08:00",
    site: "鶯歌石",
    customerName: "（測試）王小明",
    requestedCount: 2,
    currentBooked: 8,
    capacity: 8,
    url: "https://haiwangzi.zeabur.app/liff/coach/today",
  },
  welcome: {
    liffUrl: "https://liff.line.me/2010006458-fyokMnVv",
  },
};

// POST /api/admin/templates/test-send - 預覽（推給 admin 自己）
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { key } = BodySchema.parse(await req.json());
  if (!(key in FLEX_TEMPLATES)) {
    return NextResponse.json({ error: "unknown template key" }, { status: 400 });
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN not set" },
      { status: 503 },
    );
  }

  const params = SAMPLE_PARAMS[key] ?? {};
  const msg = await buildFlexByKeyAsync(
    key as keyof typeof FLEX_TEMPLATES,
    params,
    "（測試）" + key,
  );

  const client = getLineClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.pushMessage({ to: auth.user.lineUserId, messages: [msg as any] });
    return NextResponse.json({ ok: true, sentTo: auth.user.lineUserId });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
