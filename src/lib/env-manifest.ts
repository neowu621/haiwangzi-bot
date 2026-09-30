// v1078：環境變數清單 + 自檢。
//   起因：Zeabur 把「環境變數與設定檔」從平台搬到自架伺服器（2026-08-27 外洩事件的對策）。
//   搬家最怕的不是失敗，是「搬完少了一個」—— 站台照樣起得來，只有某一個子系統
//   安靜地壞掉（例如圖片傳不上去、天氣排程不跑），常常過幾天才被發現。
//   這支清單讓 `/api/healthz?env=1` 一行 curl 就看得出來。
//
//   ⚠️ 絕對不輸出任何變數的「值」—— 只回報有沒有設定。
//
//   v1079 修正：第一版只認單一變數名，結果誤報 2 個 required 不見了 ——
//     實際上程式到處都是後備鏈（例如 `LINE_MSGAPI_CHANNEL_ACCESS_TOKEN ?? LINE_CHANNEL_ACCESS_TOKEN`），
//     部署設的是舊名，清單卻只認新名。自檢誤報比沒有自檢更糟（會讓人以為搬丟了東西、
//     或反過來學會忽略警告），所以改成「一組別名，任一個有值就算到齊」，
//     並且每一組都對照程式實際的讀法。

export type EnvTier = "required" | "feature" | "optional";

export interface EnvSpec {
  /** 別名組：任一個有值就算到齊（對應程式裡的 `A ?? B` 後備鏈） */
  names: string[];
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
  { names: ["DATABASE_URL"], tier: "required", impact: "資料庫連不上，全站掛" },
  { names: ["JWT_SECRET"], tier: "required", impact: "所有登入失效（客戶與後台）" },
  { names: ["ADMIN_WEB_SECRET"], tier: "required", impact: "後台無法登入" },
  // lib/line.ts:34,61 —— MSGAPI 新名優先，舊名為後備
  { names: ["LINE_MSGAPI_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN"], tier: "required", impact: "所有 LINE 推播與回覆停止" },
  { names: ["LINE_MSGAPI_CHANNEL_SECRET", "LINE_CHANNEL_SECRET"], tier: "required", impact: "LINE webhook 驗簽失敗，收不到訊息" },

  // ── 站台活著，但某個功能會壞 ──────────────────────────────
  // 程式內建 fallback "https://haiwangzi.xyz"，正式站剛好正確 → 不列 required，
  // 但缺了在其他環境（預覽/測試）會把連結指到正式站，仍該補上。
  { names: ["NEXT_PUBLIC_BASE_URL"], tier: "feature", impact: "通知信／推播的連結退回寫死的網域" },
  { names: ["NEXT_PUBLIC_APP_URL"], tier: "feature", impact: "部分通知連結退回寫死的網域" },
  { names: ["LINE_LOGIN_CHANNEL_ID"], tier: "feature", impact: "電腦版 LINE 登入不能用" },
  { names: ["LINE_LOGIN_CHANNEL_SECRET"], tier: "feature", impact: "電腦版 LINE 登入不能用" },
  // lib/liff 讀法：LINE_LIFF_ID ?? NEXT_PUBLIC_LIFF_ID
  { names: ["LINE_LIFF_ID", "NEXT_PUBLIC_LIFF_ID"], tier: "feature", impact: "LIFF 開不起來（手機端整個不能用）" },
  { names: ["R2_ACCOUNT_ID"], tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  { names: ["R2_ACCESS_KEY_ID"], tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  { names: ["R2_SECRET_ACCESS_KEY"], tier: "feature", impact: "圖片／匯款證明上傳失敗" },
  // lib/r2.ts:22 —— R2_PUBLIC_BUCKET ?? R2_BUCKET（再不然有寫死預設）
  { names: ["R2_PUBLIC_BUCKET", "R2_BUCKET"], tier: "feature", impact: "公開圖片桶退回寫死的預設名" },
  // lib/r2.ts:26 —— R2_PUBLIC_URL ?? NEXT_PUBLIC_R2_PUBLIC_BASE
  { names: ["R2_PUBLIC_URL", "NEXT_PUBLIC_R2_PUBLIC_BASE"], tier: "feature", impact: "圖片顯示不出來（沒有公開網址前綴）" },
  { names: ["GMAIL_USER"], tier: "feature", impact: "寄不出通知信" },
  { names: ["GMAIL_APP_PASSWORD"], tier: "feature", impact: "寄不出通知信" },
  { names: ["INBOUND_GMAIL_USER"], tier: "feature", impact: "收不到客服信箱來信" },
  { names: ["INBOUND_GMAIL_APP_PASSWORD"], tier: "feature", impact: "收不到客服信箱來信" },
  { names: ["CRON_SECRET"], tier: "feature", impact: "所有排程停擺（催繳／D-1 提醒／天氣／備份）" },
  { names: ["CWA_API_KEY"], tier: "feature", impact: "天氣預報與自動取消判斷失效" },
  { names: ["TURNSTILE_SECRET_KEY"], tier: "feature", impact: "公開表單的機器人防護失效" },
  { names: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY"], tier: "feature", impact: "公開表單的驗證元件不顯示" },

  // ── 缺了只是少一點東西 ────────────────────────────────────
  { names: ["ADMIN_NOTIFY_EMAIL"], tier: "optional", impact: "老闆收不到系統通知信（站內／LINE 仍會發）" },
  { names: ["ADMIN_LINE_USER_IDS"], tier: "optional", impact: "老闆 LINE 推播改用 DB 裡的管理員名單（仍可運作）" },
  { names: ["NEXT_PUBLIC_GA_ID"], tier: "optional", impact: "沒有 GA4 流量統計" },
  { names: ["BANK_ACCOUNT"], tier: "optional", impact: "匯款說明少了帳號" },
  { names: ["ZSEND_API_KEY"], tier: "optional", impact: "備用寄信通道停用（主通道 Gmail 仍可）" },
];

export interface EnvCheckDetail {
  /** 這一組全部都沒設定的變數名（任一個有值就不會出現在這裡） */
  names: string[];
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
    const satisfied = spec.names.some((n) => {
      const v = process.env[n];
      return v !== undefined && v.trim() !== "";
    });
    if (!satisfied) missing.push({ names: spec.names, tier: spec.tier, impact: spec.impact });
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
