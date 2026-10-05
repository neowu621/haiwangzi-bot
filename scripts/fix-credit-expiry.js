/**
 * 把已發出的「只發一次」獎勵改成永不過期（v1082）
 *
 * 業務規則：首潛獎勵、VIP 升等獎勵、滿級回饋、退款轉抵用金 —— 這些都只會發一次，
 * 目的是鼓勵客人回來潛水。設了期限就變成「沒在期限內回來就沒收」，跟發它的用意相反。
 * 程式端已經在 src/lib/credit-expiry.ts 的 NEVER_EXPIRE 擋掉，但**過去已經發出去的
 * 那些仍帶著到期日**，這支負責清掉。
 *
 * 處理原則（老闆指示）：
 *   ✅ 還沒用完的 → expires_at 設成 null（無時間限制）
 *   ⏭️ 已經用掉的 → 不處理（錢已經花在訂單上了，沒有意義）
 *   ⚠️ 已經到期被作廢的 → **本腳本不動它**，只列出來給你決定
 *      （要還回去的話是加錢給客戶、會動到餘額，那不該由一支修時間的腳本順手做）
 *
 * 使用：
 *   node scripts/fix-credit-expiry.js            # 試算，不寫入任何資料
 *   node scripts/fix-credit-expiry.js --apply    # 實際清除到期日
 *
 * 安全性：預設唯讀；--apply 只會把 expires_at 改成 null，不碰金額、不碰餘額。
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// 與 src/lib/credit-expiry.ts 的 NEVER_EXPIRE 保持一致
const NEVER_EXPIRE = ["first_order_reward", "vip_upgrade", "vip_overflow"];
const LABEL = {
  first_order_reward: "首潛獎勵",
  vip_upgrade: "升等獎勵",
  vip_overflow: "滿級回饋",
  refund: "退款轉抵用金",
};

const APPLY = process.argv.includes("--apply");

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

const fmt = (d) => (d ? new Date(d).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "—");
const money = (n) => `NT$${Number(n).toLocaleString()}`;
const line = (t) => console.log("\n" + "─".repeat(74) + "\n" + t + "\n" + "─".repeat(74));

(async () => {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error("找不到 DATABASE_URL（請設環境變數或寫在 .env）");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log(APPLY ? "模式：⚠️  實際寫入（--apply）" : "模式：試算，不會寫入任何資料");

    const rows = await prisma.creditTx.findMany({
      where: { reason: { in: NEVER_EXPIRE }, amount: { gt: 0 }, expiresAt: { not: null } },
      select: {
        id: true, code: true, userId: true, reason: true, amount: true,
        consumedAmount: true, forfeitedAmount: true, expiresAt: true, createdAt: true,
        user: { select: { realName: true, displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const nameOf = (r) => r.user?.realName ?? r.user?.displayName ?? r.userId.slice(0, 10);
    const remainOf = (r) => r.amount - r.consumedAmount;

    // 還有剩餘可用 → 這次要清掉到期日
    const toFix = rows.filter((r) => remainOf(r) > 0);
    // 已作廢（到期被沒收）→ 只列出來，不動
    const forfeited = rows.filter((r) => remainOf(r) <= 0 && r.forfeitedAmount > 0);
    // 真的用掉了 → 不處理
    const used = rows.filter((r) => remainOf(r) <= 0 && r.forfeitedAmount <= 0);

    line(`① 要改成永不過期的（還沒用完）：${toFix.length} 筆`);
    if (toFix.length === 0) console.log("（無）");
    for (const r of toFix) {
      console.log(
        `${(r.code ?? r.id.slice(0, 8)).padEnd(16)} ${(LABEL[r.reason] ?? r.reason).padEnd(14)} ` +
        `${nameOf(r).padEnd(12)} 剩餘 ${money(remainOf(r)).padEnd(10)} 原到期日 ${fmt(r.expiresAt)}`,
      );
    }
    const totalRemain = toFix.reduce((s, r) => s + remainOf(r), 0);
    if (toFix.length > 0) console.log(`\n合計解除限制 ${money(totalRemain)}`);

    line(`② 已到期被作廢的：${forfeited.length} 筆（本腳本不動，請你決定）`);
    if (forfeited.length === 0) console.log("（無 —— 沒有人因為過期被沒收過）");
    for (const r of forfeited) {
      console.log(
        `${(r.code ?? r.id.slice(0, 8)).padEnd(16)} ${(LABEL[r.reason] ?? r.reason).padEnd(14)} ` +
        `${nameOf(r).padEnd(12)} 被沒收 ${money(r.forfeitedAmount).padEnd(10)} 到期日 ${fmt(r.expiresAt)}`,
      );
    }
    if (forfeited.length > 0) {
      const t = forfeited.reduce((s, r) => s + r.forfeitedAmount, 0);
      console.log(
        `\n合計 ${money(t)} 曾因到期被沒收。\n` +
        "新規則上路後這些本來就不該過期 —— 要不要還給客戶是你的決定。\n" +
        "要還的話請用後台「抵用金管理」手動發放，會留下正常的發放紀錄與通知。",
      );
    }

    line(`③ 已實際使用掉的：${used.length} 筆（不處理）`);
    console.log(used.length === 0 ? "（無）" : `共 ${used.length} 筆，錢已經花在訂單上，改到期日沒有意義。`);

    // ── 寫入 ────────────────────────────────────────────────
    if (!APPLY) {
      line("這是試算，沒有寫入任何資料");
      console.log("確認無誤後執行：node scripts/fix-credit-expiry.js --apply");
    } else if (toFix.length === 0) {
      line("沒有需要修改的資料");
    } else {
      const r = await prisma.creditTx.updateMany({
        where: { id: { in: toFix.map((x) => x.id) } },
        data: { expiresAt: null },
      });
      line("完成");
      console.log(`已把 ${r.count} 筆的到期日清除（永不過期），共解除 ${money(totalRemain)} 的使用限制。`);
      console.log("只改了 expires_at，沒有碰金額或餘額。");
    }
  } catch (e) {
    console.error("執行失敗：", e.message ?? e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
