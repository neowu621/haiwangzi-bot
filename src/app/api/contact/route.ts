import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let b: ContactBody;
  try {
    b = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // honeypot：機器人才會填
  if (b.hp && b.hp.trim()) return NextResponse.json({ ok: true }); // 假裝成功，不入庫

  const type = b.type === "wish" ? "wish" : "question";
  const name = (b.name ?? "").trim().slice(0, 60);
  const email = (b.email ?? "").trim().slice(0, 120);
  const phone = (b.phone ?? "").trim().slice(0, 40);
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

  try {
    await prisma.$transaction(async (tx) => {
      const thread = await tx.emailThread.create({
        data: {
          subject,
          customerEmail: email,
          customerName: phone ? `${name}（☎ ${phone}）` : name,
          status: "WAITING",
          tags: ["網站詢問", tag],
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
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
