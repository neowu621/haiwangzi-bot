/**
 * 資安事件盤查腳本（2026-08-27 Zeabur 環境變數外洩事件）
 *
 * 用途：換完金鑰之後，確認「有沒有真的被進來過」。換鎖只是止血，
 *       這支是在回答更重要的問題 —— 損害範圍到哪裡。
 *
 * 使用：
 *   node scripts/security-audit.js              # 讀 .env 的 DATABASE_URL
 *   DATABASE_URL="postgresql://..." node scripts/security-audit.js
 *
 * 安全性：
 *   - 只做讀取，不寫入任何資料
 *   - 不會印出連線字串、密碼或任何憑證
 *   - 輸出可以直接貼給別人看（不含個資全文，姓名只顯示部分）
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// 事件發生日 —— 這之後的活動都要看
const INCIDENT_DATE = new Date("2026-08-27T00:00:00+08:00");

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

const mask = (s) => (!s ? "—" : s.length <= 2 ? s : s[0] + "*".repeat(Math.max(1, s.length - 2)) + s[s.length - 1]);
const fmt = (d) => (d ? new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—");
const line = (t) => console.log("\n" + "─".repeat(64) + "\n" + t + "\n" + "─".repeat(64));

(async () => {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error("找不到 DATABASE_URL（請設環境變數或寫在 .env）");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log(`資安盤查 · 事件基準日 ${fmt(INCIDENT_DATE)}`);

    // ── 1. 管理權限帳號 ────────────────────────────────────────
    //    最該先看的：攻擊者若進得來，最省事的後門就是新增一個管理員。
    line("① 具管理權限的帳號（確認每一個你都認得）");
    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ["admin", "boss", "it"] } },
          { roles: { hasSome: ["admin", "boss", "it"] } },
        ],
      },
      select: { lineUserId: true, displayName: true, realName: true, role: true, roles: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    for (const a of admins) {
      const isNew = a.createdAt >= INCIDENT_DATE;
      console.log(
        `${isNew ? "🚨 事件後新增 " : "   "}${(a.realName ?? a.displayName ?? "").padEnd(12)} ` +
        `role=${a.role} roles=[${(a.roles ?? []).join(",")}] 建立=${fmt(a.createdAt)} id=${a.lineUserId.slice(0, 10)}…`,
      );
    }
    console.log(`\n共 ${admins.length} 個管理帳號，其中 ${admins.filter((a) => a.createdAt >= INCIDENT_DATE).length} 個是事件後才建立的`);

    // ── 2. 事件後的後台操作 ────────────────────────────────────
    line("② 事件後的後台操作紀錄（非 customer 的動作）");
    const adminLogs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: INCIDENT_DATE }, NOT: { actorRole: "customer" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { createdAt: true, actorName: true, actorRole: true, actorIp: true, action: true, targetLabel: true },
    });
    if (adminLogs.length === 0) console.log("（無）");
    for (const l of adminLogs) {
      console.log(`${fmt(l.createdAt)}  ${(l.actorName ?? "—").padEnd(10)} ${(l.actorRole ?? "").padEnd(8)} ${(l.actorIp ?? "—").padEnd(16)} ${l.action} ${l.targetLabel ?? ""}`);
    }

    // ── 3. 事件後出現的新 IP ───────────────────────────────────
    //    攻擊者若偽造 JWT 進後台，IP 通常跟平常不一樣。
    line("③ 事件後才出現的來源 IP（之前從未見過的）");
    const [before, after] = await Promise.all([
      prisma.auditLog.findMany({ where: { createdAt: { lt: INCIDENT_DATE } }, select: { actorIp: true }, distinct: ["actorIp"] }),
      prisma.auditLog.findMany({ where: { createdAt: { gte: INCIDENT_DATE } }, select: { actorIp: true, actorName: true, actorRole: true }, distinct: ["actorIp"] }),
    ]);
    const known = new Set(before.map((x) => x.actorIp).filter(Boolean));
    const fresh = after.filter((x) => x.actorIp && !known.has(x.actorIp));
    if (fresh.length === 0) console.log("（沒有新 IP —— 這是好消息）");
    for (const f of fresh) {
      console.log(`${(f.actorIp ?? "").padEnd(18)} ${f.actorName ?? "—"} (${f.actorRole ?? "—"})`);
    }

    // ── 4. 資料量對照 ──────────────────────────────────────────
    //    大量刪除／竄改會反映在總數上。第一次跑先留底，之後比對。
    line("④ 資料量（第一次跑請留底，日後比對用）");
    const [users, bookings, credits, notifs] = await Promise.all([
      prisma.user.count(),
      prisma.booking.count(),
      prisma.creditTx.count(),
      prisma.notification.count(),
    ]);
    console.log(`會員 ${users} · 訂單 ${bookings} · 抵用金異動 ${credits} · 站內通知 ${notifs}`);

    // ── 5. 事件後的抵用金異動 ──────────────────────────────────
    //    能直接變現的地方：偷發抵用金給自己的帳號。
    line("⑤ 事件後的抵用金發放（找有沒有被偷發）");
    const grants = await prisma.creditTx.findMany({
      where: { createdAt: { gte: INCIDENT_DATE }, amount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, userId: true, amount: true, reason: true, note: true },
    });
    if (grants.length === 0) console.log("（無）");
    for (const g of grants) {
      console.log(`${fmt(g.createdAt)}  +${String(g.amount).padStart(6)}  ${(g.reason ?? "").padEnd(20)} ${g.userId.slice(0, 10)}… ${g.note ?? ""}`);
    }

    line("盤查完成");
    console.log(
      "判讀：①有不認識的管理員、②有你沒做過的操作、③出現陌生 IP、⑤有來路不明的抵用金 —— \n" +
      "任何一項成立，就要當作『確定被進來過』處理，並把範圍記錄下來。",
    );
  } catch (e) {
    console.error("盤查失敗：", e.message ?? e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
