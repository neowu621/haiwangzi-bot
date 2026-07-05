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

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, { scope: "assistant-fb", windowMs: 60_000, max: 10 });
  if (limited) return limited;

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
