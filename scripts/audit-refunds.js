/**
 * 退款盤點（v1077）
 *
 * 在問一件事：**有沒有訂單標成「已退款」，但客戶其實沒拿到錢？**
 *
 * 正規退款流程（/api/admin/bookings/[id]/refund）會一次做完五件事：
 *   paymentStatus=refunded、refundMethod、refundAmount/refundedAt、
 *   method=credit 時發抵用金(CreditTx reason="refund")、通知客戶。
 * 但「訂單編輯 → 付款狀態改成已退款」那條路只改 paymentStatus 一個欄位。
 * 走過那條路的訂單，看起來已退款，實際上客戶帳戶裡什麼都沒有。
 *
 * 使用：
 *   node scripts/audit-refunds.js              # 讀 .env 的 DATABASE_URL
 *   DATABASE_URL="postgresql://..." node scripts/audit-refunds.js
 *
 * 安全性：**只讀，不寫任何資料**。不會印出連線字串或憑證。
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.join(__dirname, "..", ".env");
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (line) return line.replace(/^\s*DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  } catch { /* ignore */ }
  return null;
}

const fmt = (d) => (d ? new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—");
const money = (n) => (n == null ? "—" : `NT$${Number(n).toLocaleString()}`);
const METHOD = { credit: "抵用金", cash: "現金" };
const line = (t) => console.log("\n" + "─".repeat(72) + "\n" + t + "\n" + "─".repeat(72));

(async () => {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error("找不到 DATABASE_URL（請設環境變數或寫在 .env）");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const refunded = await prisma.booking.findMany({
      where: { paymentStatus: "refunded" },
      select: {
        id: true, code: true, userId: true, type: true,
        totalAmount: true, paidAmount: true,
        refundMethod: true, refundAmount: true, refundedAt: true,
        createdAt: true,
        user: { select: { realName: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 對照：這些訂單有沒有對應的「退費轉抵用金」紀錄
    const creditTxs = await prisma.creditTx.findMany({
      where: { reason: "refund", refType: "booking", refId: { in: refunded.map((b) => b.id) } },
      select: { refId: true, amount: true, createdAt: true },
    });
    const creditByBooking = new Map();
    for (const t of creditTxs) {
      const prev = creditByBooking.get(t.refId) ?? { amount: 0, at: null };
      creditByBooking.set(t.refId, { amount: prev.amount + t.amount, at: prev.at ?? t.createdAt });
    }

    const nameOf = (b) => b.user?.realName ?? b.user?.displayName ?? b.userId.slice(0, 10);

    console.log(`退款盤點 · 共 ${refunded.length} 筆 paymentStatus=refunded 的訂單`);

    // ── ① 沒有退款方式紀錄 ──────────────────────────────────
    //    走「訂單編輯」那條路留下的痕跡：狀態改了，其他欄位全空。
    line("① 標成已退款，但沒有退款方式紀錄（最可疑）");
    const noMethod = refunded.filter((b) => !b.refundMethod);
    if (noMethod.length === 0) console.log("（無 —— 全部都有記錄方式，這是好消息）");
    for (const b of noMethod) {
      const credit = creditByBooking.get(b.id);
      console.log(
        `${(b.code ?? b.id.slice(0, 8)).padEnd(18)} ${nameOf(b).padEnd(12)} ` +
        `已付=${money(b.paidAmount).padEnd(11)} 退款額=${money(b.refundAmount).padEnd(11)} ` +
        `退款時間=${b.refundedAt ? fmt(b.refundedAt) : "未記錄"} ` +
        `抵用金=${credit ? money(credit.amount) : "🚨 無"}`,
      );
    }

    // ── ② 方式是抵用金，卻找不到抵用金紀錄 ───────────────────
    //    這是最該優先處理的：系統說退了抵用金，客戶帳戶裡卻沒有。
    line("② 退款方式=抵用金，但查無對應抵用金入帳（客戶可能沒拿到錢）");
    const creditMissing = refunded.filter((b) => b.refundMethod === "credit" && !creditByBooking.has(b.id));
    if (creditMissing.length === 0) console.log("（無 —— 每筆抵用金退款都有對應入帳）");
    for (const b of creditMissing) {
      console.log(
        `🚨 ${(b.code ?? b.id.slice(0, 8)).padEnd(18)} ${nameOf(b).padEnd(12)} ` +
        `應退=${money(b.refundAmount)} 退款時間=${fmt(b.refundedAt)}`,
      );
    }

    // ── ③ 金額對不上 ────────────────────────────────────────
    line("③ 退款方式=抵用金，但入帳金額與退款金額不符（可能是加成，也可能是錯）");
    const mismatch = refunded.filter((b) => {
      const c = creditByBooking.get(b.id);
      return b.refundMethod === "credit" && c && b.refundAmount != null && c.amount !== b.refundAmount;
    });
    if (mismatch.length === 0) console.log("（無）");
    for (const b of mismatch) {
      const c = creditByBooking.get(b.id);
      const diff = c.amount - b.refundAmount;
      console.log(
        `${(b.code ?? b.id.slice(0, 8)).padEnd(18)} ${nameOf(b).padEnd(12)} ` +
        `退款額=${money(b.refundAmount)} 入帳=${money(c.amount)} ` +
        `差額=${diff > 0 ? "+" : ""}${diff.toLocaleString()}` +
        `${diff > 0 ? "（可能是天氣取消加成，正常）" : "（入帳比應退少，要查）"}`,
      );
    }

    // ── ④ 正常的現金退款（列出來對帳用）─────────────────────
    line("④ 現金退款（需線下匯出，列出來供對帳）");
    const cash = refunded.filter((b) => b.refundMethod === "cash");
    if (cash.length === 0) console.log("（無）");
    for (const b of cash) {
      console.log(
        `${(b.code ?? b.id.slice(0, 8)).padEnd(18)} ${nameOf(b).padEnd(12)} ` +
        `退款額=${money(b.refundAmount).padEnd(11)} 退款時間=${fmt(b.refundedAt)}`,
      );
    }

    // ── 總結 ────────────────────────────────────────────────
    line("總結");
    const byMethod = refunded.reduce((acc, b) => {
      const k = b.refundMethod ? (METHOD[b.refundMethod] ?? b.refundMethod) : "未記錄";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    console.log(Object.entries(byMethod).map(([k, v]) => `${k} ${v} 筆`).join(" · "));
    console.log(
      `\n要處理的：① ${noMethod.length} 筆沒方式 · ② ${creditMissing.length} 筆抵用金沒入帳 · ③ ${mismatch.length} 筆金額不符\n` +
      "②最急 —— 那是客戶以為拿到了、實際沒拿到的錢。確認後可用後台『抵用金管理』補發。",
    );
  } catch (e) {
    console.error("盤點失敗：", e.message ?? e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
