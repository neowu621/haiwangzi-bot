#!/usr/bin/env node
/**
 * 上線後「正式環境」自動煙霧測試（前端 + 後端）。
 *
 * 用法：
 *   node scripts/verify-prod.mjs <expectedVersion>
 *   例：node scripts/verify-prod.mjs 20260610_450
 *   （不帶版本則只檢查可用性，不比對版本）
 *
 * 檢查項目：
 *   1. /api/healthz 回 200 且版本符合（確認新版真的上線，不是還在跑舊版）
 *   2. 公開頁面可達：/ (首頁)、/test 轉址、/liff、/admin/login
 *   3. 受保護 API 正確擋下未授權：/api/admin/stats/lite、/api/me/notifications/unread-count → 401
 *   4. 公開高頻 API 有 Cache-Control 快取標頭：/api/config、/api/site-config
 *   5. 公開 API 不洩漏：/api/config 不含 token/secret 字樣
 *
 * 任一紅燈 → process.exit(1)，可接進 CI / 部署後把關。
 */

const BASE = process.env.HAIWANGZI_BASE_URL || "https://haiwangzi.zeabur.app";
const expectedVersion = process.argv[2] || null;
const UA = { "User-Agent": "verify-prod/1.0" };

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, detail = "") { pass++; console.log(`  ✅ ${name}${detail ? "  " + detail : ""}`); }
function bad(name, detail = "") { fail++; fails.push(name); console.log(`  ❌ ${name}${detail ? "  " + detail : ""}`); }

async function req(path, { redirect = "manual", headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(BASE + path, { redirect, headers: { ...UA, ...headers }, signal: ctrl.signal });
    return res;
  } finally { clearTimeout(t); }
}

async function main() {
  console.log(`\n🔎 驗證 ${BASE}${expectedVersion ? `（預期版本 ${expectedVersion}）` : ""}\n`);

  // 1. healthz + 版本
  console.log("[1] 健康檢查 / 版本");
  try {
    const r = await req("/api/healthz");
    const j = await r.json();
    if (r.status === 200 && j.ok) ok("healthz 200", `version=${j.version}`);
    else bad("healthz", `status=${r.status}`);
    if (expectedVersion) {
      if (j.version === expectedVersion) ok(`版本符合 ${expectedVersion}`);
      else bad("版本不符（新版可能還沒上線）", `線上=${j.version} 預期=${expectedVersion}`);
    }
  } catch (e) { bad("healthz 連線失敗", String(e.message || e)); }

  // 2. 公開頁面
  console.log("[2] 公開頁面可達");
  const pageChecks = [
    { path: "/", want: [200], must: "東北角海王子" },
    { path: "/liff", want: [200] },
    { path: "/admin/login", want: [200] },
  ];
  for (const c of pageChecks) {
    try {
      const r = await req(c.path, { redirect: "follow" });
      const body = c.must ? await r.text() : "";
      if (c.want.includes(r.status) && (!c.must || body.includes(c.must))) ok(`GET ${c.path}`, `${r.status}`);
      else bad(`GET ${c.path}`, `status=${r.status}${c.must ? ` 缺關鍵字「${c.must}」` : ""}`);
    } catch (e) { bad(`GET ${c.path}`, String(e.message || e)); }
  }
  // /test 轉址
  try {
    const r = await req("/test", { redirect: "manual" });
    if (r.status >= 300 && r.status < 400) ok("/test 轉址", `${r.status} → ${r.headers.get("location")}`);
    else bad("/test 應轉址到 /", `status=${r.status}`);
  } catch (e) { bad("/test", String(e.message || e)); }

  // 3. 受保護 API 應 401
  console.log("[3] 受保護 API 擋下未授權（401）");
  for (const p of ["/api/admin/stats/lite", "/api/me/notifications/unread-count"]) {
    try {
      const r = await req(p);
      if (r.status === 401) ok(`${p} → 401`);
      else bad(`${p} 未正確擋下`, `status=${r.status}（應 401）`);
    } catch (e) { bad(p, String(e.message || e)); }
  }

  // 4. 公開高頻 API 快取標頭
  console.log("[4] 公開高頻 API 快取標頭");
  for (const p of ["/api/config", "/api/site-config"]) {
    try {
      const r = await req(p);
      const cc = r.headers.get("cache-control") || "";
      if (r.status === 200 && /s-maxage=\d+/.test(cc)) ok(`${p} 有快取`, cc);
      else bad(`${p} 缺 Cache-Control`, `status=${r.status} cc="${cc}"`);
    } catch (e) { bad(p, String(e.message || e)); }
  }

  // 5. 公開 API 不洩漏機敏字
  console.log("[5] 公開 API 不洩漏機敏資料");
  try {
    const r = await req("/api/config");
    const txt = await r.text();
    const leak = /"?(secret|token|password|api[_-]?key|cron_secret)"?\s*:/i.test(txt);
    if (!leak) ok("/api/config 無 secret/token/password 欄位");
    else bad("/api/config 疑似洩漏機敏欄位");
  } catch (e) { bad("/api/config 洩漏檢查", String(e.message || e)); }

  console.log(`\n──────── 結果：${pass} 通過 / ${fail} 失敗 ────────`);
  if (fail > 0) { console.log("❌ 紅燈：" + fails.join("、")); process.exit(1); }
  console.log("✅ 全部通過");
}
main().catch((e) => { console.error("verify-prod 執行失敗", e); process.exit(1); });
