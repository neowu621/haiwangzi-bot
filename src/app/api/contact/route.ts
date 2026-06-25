import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyBossNewInquiry, sendCustomerAck } from "@/lib/notify-boss";
import { checkRateLimit } from "@/lib/rate-limit";
import { authFromRequest } from "@/lib/auth"; // v671：已登入會員(/pclogin)走快速通道

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contact — 公開客戶詢問表單（無需登入）。
 *   type=question 購買疑慮 / type=wish 開團許願。
 *   送出後直接在後台「客服信箱」開一條 WAITING 對話，老闆同一處理。
 * 防濫用：honeypot 欄位 hp 必須空白；基本欄位驗證。
 */
interface ContactBody {
  type?: "question" | "wish";
  topic?: string;       // 選的 chip（方案 / 地點）
  subject?: string;     // 客人補充的主旨
  message?: string;     // 想問什麼 / 備註
  name?: string;
  email?: string;
  phone?: string;
  when?: string;        // wish：時間
  people?: string;      // wish：人數
  hp?: string;          // honeypot
  turnstileToken?: string; // Cloudflare Turnstile token
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 後端對驗 Cloudflare Turnstile token（secret 沒設時跳過，避免設定前壞掉）。 */
async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // v614：正式環境未設 secret → fail-closed（擋下，避免機器人保護被靜默關閉）；非正式環境放行方便開發。
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // v614：公開未登入端點 → 加速率限制（每 IP 每分鐘最多 5 次），防 DB/外寄信濫用。
  const limited = checkRateLimit(req, { scope: "contact", windowMs: 60_000, max: 5 });
  if (limited) return limited;

  let b: ContactBody;
  try {
    b = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // honeypot：機器人才會填
  if (b.hp && b.hp.trim()) return NextResponse.json({ ok: true }); // 假裝成功，不入庫

  // v671：已登入會員(/pclogin)走快速通道 — 免 Turnstile、姓名/Email/電話自動帶會員資料。
  const auth = await authFromRequest(req).catch(() => ({ ok: false } as const));
  const member = auth.ok ? auth.user : null;

  // Cloudflare Turnstile 機器人驗證（未登入訪客才需要；登入會員已有身分驗證）
  if (!member) {
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (!(await verifyTurnstile(b.turnstileToken, ip))) {
      return NextResponse.json({ error: "機器人驗證未通過，請重試" }, { status: 400 });
    }
  }

  const type = b.type === "wish" ? "wish" : "question";
  const name = ((b.name ?? "") || member?.realName || member?.displayName || "").trim().slice(0, 60);
  const email = ((b.email ?? "") || member?.email || "").trim().slice(0, 120);
  const phone = ((b.phone ?? "") || member?.phone || "").trim().slice(0, 40);
  const topic = (b.topic ?? "").trim().slice(0, 20);
  const subjRaw = (b.subject ?? "").trim().slice(0, 120);
  const message = (b.message ?? "").trim().slice(0, 2000);

  if (!name) return NextResponse.json({ error: "請填姓名" }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "請填正確 Email" }, { status: 400 });
  if (type === "question" && !message) return NextResponse.json({ error: "請描述你的問題" }, { status: 400 });
  if (type === "wish" && !topic) return NextResponse.json({ error: "請選想去的地點" }, { status: 400 });

  // 主旨：[方案/地點] + 補充
  const prefix = topic ? `[${topic}] ` : "";
  const subject = (prefix + (subjRaw || (type === "wish" ? "開團許願" : "詢問"))).slice(0, 150);

  // 內文：把所有資訊整理進信件主體
  const lines: string[] = [];
  if (type === "wish") {
    lines.push(`【開團許願】想去：${topic || "(未填)"}`);
    if (b.when) lines.push(`時間：${String(b.when).slice(0, 60)}`);
    if (b.people) lines.push(`人數：${String(b.people).slice(0, 20)}`);
    if (message) lines.push(`備註：${message}`);
  } else {
    lines.push(`【購買疑慮】方案：${topic || "(未指定)"}`);
    if (message) lines.push(message);
  }
  lines.push("");
  lines.push("──");
  lines.push(`姓名：${name}`);
  lines.push(`Email：${email}`);
  if (phone) lines.push(`電話：${phone}`);
  lines.push("（來自官網詢問表單）");
  const bodyText = lines.join("\n");

  const messageId = `<web-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@haiwangzi.xyz>`;
  const tag = type === "wish" ? "開團許願" : "購買疑慮";

  let threadId: string;
  try {
    threadId = await prisma.$transaction(async (tx) => {
      const thread = await tx.emailThread.create({
        data: {
          subject,
          customerEmail: email,
          customerName: phone ? `${name}（☎ ${phone}）` : name,
          status: "WAITING",
          // v671：登入會員洽詢加註記 + 綁 lineUserId（方便後台連到會員；不設 channel=web，故不混入會員端雙向對話）
          tags: member ? ["網站詢問", tag, "會員洽詢"] : ["網站詢問", tag],
          ...(member ? { lineUserId: member.lineUserId } : {}),
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
      return thread.id;
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 紀錄已寫入客服信箱 → 主動通知老闆（LINE + Email）。best-effort，失敗不影響送單。
  await notifyBossNewInquiry({ type, subject, name, email, phone, bodyText });
  // 客人有留 Email → 自動回覆「已收到，老闆會盡快回覆」（記成同串 OUTBOUND）。
  if (email) {
    await sendCustomerAck({ threadId, to: email, name, subject, inquiryMessageId: messageId });
  }

  return NextResponse.json({ ok: true });
}
