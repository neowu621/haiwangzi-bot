// v803：AI 小幫手答案回饋（👍👎）。記入 MessageLog（通訊紀錄可見），
//   讓老闆看得到哪些問題答不好 → 補知識庫。公開端點，加限流防灌。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logMessage } from "@/lib/message-log";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
  verdict: z.enum(["up", "down"]),
});

// v804 安全加固：比照 v772 全站閘 —— 防分散 IP 灌爆 MessageLog / 洗版通訊紀錄。
//   in-memory、單實例（同 v772 前提）；超量靜默吞掉（回 ok 但不記錄，不給攻擊者訊號）。
const FB_DAY_MAX = 300; // 全站每日回饋上限（正常流量遠低於此）
let fbDayKey = "";
let fbDayCount = 0;
function feedbackGlobalGate(): boolean {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  if (fbDayKey !== today) { fbDayKey = today; fbDayCount = 0; }
  if (fbDayCount >= FB_DAY_MAX) return true;
  fbDayCount++;
  return false;
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, { scope: "assistant-fb", windowMs: 60_000, max: 10 });
  if (limited) return limited;
  // 單 IP 每日上限（防單一來源慢速灌）
  const dayLimited = checkRateLimit(req, { scope: "assistant-fb-day", windowMs: 24 * 60 * 60_000, max: 30 });
  if (dayLimited) return dayLimited;
  // 全站每日上限（防分散 IP）— 超量回 ok 但不記錄
  if (feedbackGlobalGate()) return NextResponse.json({ ok: true });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const { question, answer, verdict } = parsed.data;

  logMessage({
    channel: "inapp",
    templateKey: "ai_feedback",
    recipient: "網站訪客",
    title: `[${verdict === "up" ? "👍" : "👎"}] ${question.slice(0, 120)}`,
    status: "sent",
    // 答案放 error 欄（Text）供老闆檢視 AI 當時怎麼答
    error: answer,
    source: "assistant",
  });

  return NextResponse.json({ ok: true });
}
