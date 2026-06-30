// v758+：網站 AI 客服。POST 對話訊息 → Claude Haiku 4.5 回答（知識庫見 lib/assistant-kb）。
//   工具：submit_inquiry（客戶想被主動聯繫時，把需求送進客服信箱 + 通知老闆，重用 /api/contact 的後端邏輯）。
//   公開端點：加速率限制；ANTHROPIC_API_KEY 未設時回 503。
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { notifyBossNewInquiry } from "@/lib/notify-boss";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildSystemPrompt } from "@/lib/assistant-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5"; // 客服 FAQ：快又便宜
const MAX_HISTORY = 12;           // 只帶最近 N 則，控成本
const MAX_TURNS = 4;              // 工具迴圈上限

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ChatMsg { role?: string; content?: string }

const TOOLS: Anthropic.Tool[] = [
  {
    name: "submit_inquiry",
    description:
      "當訪客明確希望教練主動聯繫、或想留下需求時，把詢問送進客服信箱並通知老闆。需要對方提供稱呼與 Email。送出前請先向對方確認內容。",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "訪客稱呼" },
        email: { type: "string", description: "訪客 Email（教練回覆用）" },
        message: { type: "string", description: "訪客的需求／問題摘要（含想潛的地點、日期、人數等）" },
      },
      required: ["name", "email", "message"],
    },
  },
];

/** submit_inquiry 工具：把詢問寫進客服信箱（emailThread/Message）+ 通知老闆。server 端可信、免 Turnstile。 */
async function runSubmitInquiry(input: { name?: string; email?: string; message?: string }): Promise<string> {
  const name = (input.name ?? "").trim().slice(0, 60);
  const email = (input.email ?? "").trim().slice(0, 120);
  const message = (input.message ?? "").trim().slice(0, 2000);
  if (!name) return "需要對方的稱呼才能送出，請先詢問。";
  if (!email || !EMAIL_RE.test(email)) return "Email 格式不正確，請向對方確認正確 Email 再送。";
  if (!message) return "需要需求內容才能送出。";

  const subject = `[AI 客服] ${name} 的詢問`.slice(0, 150);
  const bodyText = [
    "【網站 AI 客服轉來的詢問】",
    message,
    "",
    "──",
    `姓名：${name}`,
    `Email：${email}`,
    "（來自網站 AI 客服小幫手）",
  ].join("\n");
  const messageId = `<aibot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@haiwangzi.xyz>`;

  try {
    await prisma.$transaction(async (tx) => {
      const thread = await tx.emailThread.create({
        data: {
          subject,
          customerEmail: email,
          customerName: name,
          status: "WAITING",
          tags: ["網站詢問", "AI 客服"],
          lastMessageAt: new Date(),
        },
      });
      await tx.emailMessage.create({
        data: {
          threadId: thread.id,
          direction: "INBOUND",
          fromAddr: email,
          toAddr: "service@haiwangzi.xyz",
          subject,
          bodyText,
          messageId,
          status: "RECEIVED",
        },
      });
    });
  } catch (e) {
    console.error("[assistant submit_inquiry]", e);
    return "送出時發生問題，請改用 LINE 官方帳號 @894bpmew 直接聯繫教練。";
  }
  // best-effort 通知老闆
  await notifyBossNewInquiry({ type: "question", subject, name, email, phone: "", bodyText }).catch(() => {});
  return "已把你的詢問送給汪汪教練了，他會盡快透過 Email 或 LINE 跟你聯繫 🙌";
}

export async function POST(req: NextRequest) {
  // 公開端點 → 加速率限制（每 IP 每分鐘 20 次）
  const limited = checkRateLimit(req, { scope: "assistant", windowMs: 60_000, max: 20 });
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI 客服尚未啟用（缺少 ANTHROPIC_API_KEY）。請先加 LINE @894bpmew 詢問。" },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMsg[] };
  try {
    body = (await req.json()) as { messages?: ChatMsg[] };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  // 清洗 + 只留最近 N 則 + 角色正規化
  const history: Anthropic.MessageParam[] = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "請提供對話訊息（最後一則需為使用者）" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [...history];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });

      if (resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            let out = "未知的工具。";
            if (block.name === "submit_inquiry") {
              out = await runSubmitInquiry(block.input as { name?: string; email?: string; message?: string });
            }
            results.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
        }
        messages.push({ role: "user", content: results });
        continue; // 讓模型根據工具結果再產生回覆
      }

      // 一般回覆：收集文字
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return NextResponse.json({ reply: text || "不好意思，我沒聽懂，可以再說一次嗎？或直接加 LINE @894bpmew 問汪汪教練 🙂" });
    }
    // 工具迴圈用盡
    return NextResponse.json({ reply: "這題我可能需要請教練協助，建議加 LINE @894bpmew 直接問汪汪教練 🙂" });
  } catch (e) {
    console.error("[assistant]", e);
    return NextResponse.json(
      { error: "AI 客服暫時無法回覆，請稍後再試或加 LINE @894bpmew 聯繫教練。" },
      { status: 500 },
    );
  }
}
