import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v477：一次性維護端點 — 把 DB 內容中殘留的舊網址 haiwangzi.zeabur.app 全部換成 haiwangzi.xyz。
//   涵蓋：訊息模板、站台設定（含 JSON）、合約範本、潛點、客製訂單備註、歷史站內通知。
//   冪等：每句 REPLACE 只動「含舊網址」的列；重複呼叫安全。
//   授權：admin/boss 或 Bearer CRON_SECRET（方便維護）。
const OLD = "haiwangzi.zeabur.app";
const NEW = "haiwangzi.xyz";

// 文字欄位：UPDATE t SET col=REPLACE(col,OLD,NEW) WHERE col LIKE '%OLD%'
const TEXT_PATCHES: Array<[string, string]> = [
  ["message_templates", "title"],
  ["message_templates", "subtitle"],
  ["message_templates", "body_text"],
  ["message_templates", "button_label"],
  ["message_templates", "alt_text"],
  ["site_config", "hero_title"],
  ["site_config", "hero_subtitle"],
  ["site_config", "safety_policy"],
  ["site_config", "dump_promo_text"],
  ["contract_templates", "content"],
  ["contract_templates", "ref_url"],
  ["dive_sites", "youtube_url"],
  ["dive_sites", "location_url"],
  ["dive_sites", "description"],
  ["bookings", "custom_ref_url"],
  ["bookings", "site_notes"],
  ["bookings", "admin_notes"],
  ["notifications", "body"],
  ["notifications", "link_url"],
];
// JSON/JSONB 欄位：整個轉文字 REPLACE 再轉回
const JSON_PATCHES: Array<[string, string, "json" | "jsonb"]> = [
  ["site_config", "external_links", "jsonb"],
  ["site_config", "payment_info", "jsonb"],
  ["site_config", "cards", "jsonb"],
];

async function run(req: NextRequest) {
  // 授權：admin/boss 或 Bearer CRON_SECRET
  let authed = false;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (process.env.CRON_SECRET && bearer && bearer === process.env.CRON_SECRET) authed = true;
  if (!authed) {
    const auth = await authFromRequest(req);
    if (auth.ok && requireRole(auth.user, ["admin"]).ok) authed = true;
  }
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // v772 縱深防禦：$executeRawUnsafe 的表名/欄名無法參數化，這裡強制白名單格式，
  //   即使未來把 TEXT_PATCHES/JSON_PATCHES 改成動態來源也不會被 SQL 識別字注入。
  const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
  const safeIdent = (s: string) => IDENT_RE.test(s);

  const results: Record<string, number> = {};
  for (const [tbl, col] of TEXT_PATCHES) {
    if (!safeIdent(tbl) || !safeIdent(col)) { results[`${tbl}.${col}__BADIDENT`] = -1; continue; }
    try {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE ${tbl} SET ${col} = REPLACE(${col}, $1, $2) WHERE ${col} LIKE '%' || $1 || '%'`,
        OLD, NEW,
      );
      if (n > 0) results[`${tbl}.${col}`] = n;
    } catch (e) { results[`${tbl}.${col}__ERR`] = -1; console.error(`[migrate-domain ${tbl}.${col}]`, e); }
  }
  for (const [tbl, col, cast] of JSON_PATCHES) {
    if (!safeIdent(tbl) || !safeIdent(col) || (cast !== "json" && cast !== "jsonb")) { results[`${tbl}.${col}__BADIDENT`] = -1; continue; }
    try {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE ${tbl} SET ${col} = REPLACE(${col}::text, $1, $2)::${cast} WHERE ${col}::text LIKE '%' || $1 || '%'`,
        OLD, NEW,
      );
      if (n > 0) results[`${tbl}.${col}`] = n;
    } catch (e) { results[`${tbl}.${col}__ERR`] = -1; console.error(`[migrate-domain ${tbl}.${col}]`, e); }
  }

  const totalRows = Object.values(results).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  return NextResponse.json({ ok: true, from: OLD, to: NEW, changed: results, totalRows });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
