// v1078：環境變數清單 + 自檢。
//   起因：Zeabur 要把「環境變數與設定檔」從平台搬到自架伺服器（2026-08-27 外洩事件的對策）。
//   搬家最怕的不是失敗，是「搬完少了一個」—— 站台照樣起得來，只有某一個子系統
//   安靜地壞掉（例如圖片傳不上去、天氣排程不跑），常常過幾天才被發現。
//   這支清單讓 `/api/healthz?env=1` 一行 curl 就看得出來。
//
//   ⚠️ 絕對不輸出任何變數的「值」—— 只回報有沒有設定。

export type EnvTier = "required" | "feature" | "optional";

export interface EnvSpec {
  name: string;
  tier: EnvTier;
  /** 缺了會怎樣（給人看的，出現在自檢輸出裡） */
  impact: string;
}

/**
 * ⚠️ NEXT_PUBLIC_* 的陷阱：
 *   Next.js 會在「建置期」把 process.env.NEXT_PUBLIC_XXX 的字面寫法直接內嵌進 bundle。
 *   本檔一律用動態查表（process.env[name]）讀取，不會被內嵌，讀到的是「執行期」的值 ——
 *   所以這裡回報 present 只代表『容器現在有這個變數』，不代表前端 bundle 裡烘焙的值是對的。
 *   NEXT_PUBLIC_* 改了一定要重新 build，光重啟沒用。
 */
export const ENV_MANIFEST: EnvSpec[] = [
  // ── 沒有就整站不能用 ──────────────────────────────────────
  { name: "DATABASE_URL", tier: "required", impact: "資料庫連不上，全站掛" },
  { name: "JWT_SECRET", tier: "required", impact: "所有登入失效（客戶與後台）" },
  { name: "ADMIN_WEB_SECRET", tier: "required", impact: "後台無法登入" },
  { name: "LINE_MSGAPI_CHANNEL_ACCESS_TOKEN", tier: "required", impact: "所有 LINE 推播與回覆停止" },
  { name: "LINE_MSGAPI_CHANNEL_SECRET", tier: "required", impact: "LINE webhook 驗簽失敗，收不到訊息" },
  { name: "NEXT_PUBLIC_BASE_URL", tier: "required", impact: "通知信／推播裡的連結會壞掉" },

  // ── 站台活著，但某個功能會壞 ──────────────────────────────
  { name: "LINE_LOGIN_CHANNEL_ID", tier: "feature", impact: "電腦版 LINE 登入不能用" },
  { name: "LINE_LOGIN_CHANNEL_SECRET", tier: "feature", impact: "電腦版 LINE 登入不能用" },
  { name: "NEXT_PUBLIC_LIFF_ID", tier: "feature", impact: "LIFF 開不起來（手機端整個不能用）" },
  { name: "R2_ACCOUNT_ID", tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  { name: "R2_ACCESS_KEY_ID", tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  { name: "R2_SECRET_ACCESS_KEY", tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  { name: "R2_BUCKET", tier: "feature", impact: "圖片上傳沒有目的地" },
  { name: "GMAIL_USER", tier: "feature", impact: "寄不出通知信" },
  { name: "GMAIL_APP_PASSWORD", tier: "feature", impact: "寄不出通知信" },
  { name: "INBOUND_GMAIL_USER", tier: "feature", impact: "收不到客服信箱來信" },
  { name: "INBOUND_GMAIL_APP_PASSWORD", tier: "feature", impact: "收不到客服信箱來信" },
  { name: "CRON_SECRET", tier: "feature", impact: "所有排程停擺（催繳／D-1 提醒／天氣／備份）" },
  { name: "CWA_API_KEY", tier: "feature", impact: "天氣預報與自動取消判斷失效" },
  { name: "TURNSTILE_SECRET_KEY", tier: "feature", impact: "公開表單的機器人防護失效" },
  { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", tier: "feature", impact: "公開表單的驗證元件不顯示" },
  { name: "ADMIN_NOTIFY_EMAIL", tier: "feature", impact: "老闆收不到系統通知信" },

  // ── 缺了只是少一點東西 ────────────────────────────────────
  { name: "ADMIN_LINE_USER_IDS", tier: "optional", impact: "老闆 LINE 推播改用 DB 裡的管理員名單（仍可運作）" },
  { name: "NEXT_PUBLIC_GA_ID", tier: "optional", impact: "沒有 GA4 流量統計" },
  { name: "BANK_ACCOUNT", tier: "optional", impact: "匯款說明少了帳號" },
  { name: "ZSEND_API_KEY", tier: "optional", impact: "備用寄信通道停用（主通道 Gmail 仍可）" },
];

export interface EnvCheckDetail {
  name: string;
  tier: EnvTier;
  impact: string;
}
export interface EnvCheckResult {
  /** required 全到齊才是 true */
  ok: boolean;
  counts: { present: number; missing: number; total: number };
  /** 依層級的缺少數量（公開輸出只到這層，不含名稱） */
  missingByTier: Record<EnvTier, number>;
  /** 僅在通過 CRON_SECRET 驗證時附上；永遠只有名稱與影響，沒有值 */
  missing?: EnvCheckDetail[];
}

/**
 * 檢查環境變數是否到齊。
 * 一律用動態查表讀 process.env，避免 Next.js 建置期把 NEXT_PUBLIC_* 內嵌成字面值
 * （那樣就變成「檢查建置當下」而不是「檢查現在這個容器」）。
 */
export function checkEnv(includeNames: boolean): EnvCheckResult {
  const missing: EnvCheckDetail[] = [];
  for (const spec of ENV_MANIFEST) {
    const v = process.env[spec.name];
    if (v === undefined || v.trim() === "") {
      missing.push({ name: spec.name, tier: spec.tier, impact: spec.impact });
    }
  }
  const missingByTier: Record<EnvTier, number> = { required: 0, feature: 0, optional: 0 };
  for (const m of missing) missingByTier[m.tier] += 1;

  return {
    ok: missingByTier.required === 0,
    counts: {
      present: ENV_MANIFEST.length - missing.length,
      missing: missing.length,
      total: ENV_MANIFEST.length,
    },
    missingByTier,
    ...(includeNames ? { missing } : {}),
  };
}
