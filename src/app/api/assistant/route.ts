// v762：網站 AI 客服。POST 對話訊息 → OpenRouter（OpenAI 相容）→ Google Gemini 2.5 Flash。
//   知識庫見 lib/assistant-kb。工具 submit_inquiry：客戶想被主動聯繫時，把需求送進客服信箱 + 通知老闆。
//   公開端點：加速率限制；OPENROUTER_API_KEY 未設時回 503。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyBossNewInquiry } from "@/lib/notify-boss";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildSystemPrompt } from "@/lib/assistant-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash"; // 便宜快速、工具呼叫穩；更省可用 OPENROUTER_MODEL=google/gemini-2.5-flash-lite
const MAX_HISTORY = 12; // 只帶最近 N 則，控成本
const MAX_TURNS = 4;    // 工具迴圈上限

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ChatMsg { role?: string; content?: string }
// OpenAI 相容訊息（含 tool 角色）
interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}
interface OAIToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
interface OAIResponse {
  choices?: { message?: OAIMessage; finish_reason?: string }[];
  error?: { message?: string };
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "submit_inquiry",
      description:
        "當訪客明確希望教練主動聯繫、或想留下需求時，把詢問送進客服信箱並通知老闆。需要對方提供稱呼與 Email。送出前請先向對方確認內容。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "訪客稱呼" },
          email: { type: "string", description: "訪客 Email（教練回覆用）" },
          message: { type: "string", description: "訪客的需求／問題摘要（含想潛的地點、日期、人數等）" },
        },
        required: ["name", "email", "message"],
      },
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
  await notifyBossNewInquiry({ type: "question", subject, name, email, phone: "", bodyText }).catch(() => {});
  return "已把你的詢問送給汪汪教練了，他會盡快透過 Email 或 LINE 跟你聯繫 🙌";
}

/** 呼叫 OpenRouter chat completions。 */
async function callOpenRouter(apiKey: string, model: string, messages: OAIMessage[]): Promise<OAIResponse> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://haiwangzi.xyz",
      "X-Title": "Haiwangzi AI Assistant",
    },
    body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto", max_tokens: 1024, temperature: 0.3 }),
    signal: AbortSignal.timeout(30_000),
  });
  return (await res.json()) as OAIResponse;
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, { scope: "assistant", windowMs: 60_000, max: 20 });
  if (limited) return limited;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI 客服尚未啟用（缺少 OPENROUTER_API_KEY）。請先加 LINE @894bpmew 詢問。" },
      { status: 503 },
    );
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let body: { messages?: ChatMsg[] };
  try {
    body = (await req.json()) as { messages?: ChatMsg[] };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const history: OAIMessage[] = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "請提供對話訊息（最後一則需為使用者）" }, { status: 400 });
  }

  const messages: OAIMessage[] = [{ role: "system", content: buildSystemPrompt() }, ...history];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const data = await callOpenRouter(apiKey, model, messages);
      if (data.error) {
        console.error("[assistant openrouter]", data.error.message);
        return NextResponse.json({ error: "AI 客服暫時無法回覆，請稍後再試或加 LINE @894bpmew。" }, { status: 502 });
      }
      const msg = data.choices?.[0]?.message;
      if (!msg) {
        return NextResponse.json({ reply: "不好意思，我沒聽懂，可以再說一次嗎？或直接加 LINE @894bpmew 問汪汪教練 🙂" });
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // 回填 assistant（含 tool_calls）+ 每個工具結果（role: tool）
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          let out = "未知的工具。";
          if (call.function?.name === "submit_inquiry") {
            let args: { name?: string; email?: string; message?: string } = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
            out = await runSubmitInquiry(args);
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: out });
        }
        continue;
      }

      const text = (msg.content ?? "").trim();
      return NextResponse.json({ reply: text || "不好意思，我沒聽懂，可以再說一次嗎？或直接加 LINE @894bpmew 問汪汪教練 🙂" });
    }
    return NextResponse.json({ reply: "這題我可能需要請教練協助，建議加 LINE @894bpmew 直接問汪汪教練 🙂" });
  } catch (e) {
    console.error("[assistant]", e);
    return NextResponse.json(
      { error: "AI 客服暫時無法回覆，請稍後再試或加 LINE @894bpmew 聯繫教練。" },
      { status: 500 },
    );
  }
}
