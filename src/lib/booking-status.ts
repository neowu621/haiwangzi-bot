/**
 * v319: 訂單狀態衍生 helper
 *
 * DB 維持雙維度（BookingStatus enum + PaymentStatus enum + RefundRequest）
 * UI 用 deriveBookingDisplay() 計算單一線性 label 顯示給老闆看。
 *
 * 設計原則：
 * - 老闆心理模型是「一條時間線」，看到一個 label 就知道客戶目前在哪一步
 * - 退款是分岔（refunding/refunded）— 一旦進入就完全壓過原 status
 * - 潛水團「已付訂金但未付清」需保留 → 「已確認付款（訂金）」單獨 label
 *
 * 顯示時建議搭配 emoji + variant 上色，讓老闆掃一眼就懂。
 */

export type BookingStatusKey =
  | "created"          // 建立訂單
  | "awaiting_pay"     // 等待付款（D+1 還沒上傳憑證）
  | "awaiting_verify"  // 待確認匯款
  | "deposit_paid"     // 已確認付款（訂金）
  | "fully_paid"       // 已完成付款（全額付清，活動還沒進行）
  | "completed"        // 客戶活動完成
  | "no_show"          // 客戶未到場
  | "cancelled_user"   // 客戶取消
  | "cancelled_weather"// 天氣取消
  | "cancelled_unpaid" // 訂單不成立（D+10 沒付款 auto cancel）
  | "refunding"        // 退款處理中
  | "refunded";        // 已退款

export type BadgeVariantHint = "default" | "muted" | "gold" | "coral";

export interface BookingDisplay {
  key: BookingStatusKey;
  label: string;       // 中文 label（含 emoji）
  variant: BadgeVariantHint;
  /** 排序權重：1=最急、9=最不急 */
  priority: number;
}

/** 入參：只需這幾個欄位 */
export interface BookingForDisplay {
  status: string;            // BookingStatus enum
  paymentStatus: string;     // PaymentStatus enum
  createdAt: Date | string;
  /** 活動日（日潛=trip.date / 潛水團=package.dateStart） */
  activityDate?: Date | string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 衍生顯示 status
 * 規則（從上到下，第一個 match 就 return）：
 *   1. paymentStatus 為 refunding/refunded → 退款 label 壓過一切
 *   2. status === completed → 客戶活動完成
 *   3. status === no_show → 客戶未到場
 *   4. status === cancelled_by_user → 客戶取消
 *   5. status === cancelled_by_weather → 天氣取消
 *   6. status === cancelled_unpaid → 訂單不成立
 *   7. status === awaiting_verify → 待確認匯款
 *   8. status === confirmed + paymentStatus fully_paid → 已完成付款
 *   9. status === confirmed + paymentStatus deposit_paid → 已確認付款（訂金）
 *  10. status === confirmed + paymentStatus pending → 等待付款
 *  11. status === pending + 已過 D+1 + paymentStatus pending → 等待付款
 *  12. fallback → 建立訂單
 */
export function deriveBookingDisplay(b: BookingForDisplay): BookingDisplay {
  // 退款優先
  if (b.paymentStatus === "refunding") {
    return { key: "refunding", label: "💸 退款處理中", variant: "gold", priority: 2 };
  }
  if (b.paymentStatus === "refunded") {
    return { key: "refunded", label: "↩ 已退款", variant: "muted", priority: 8 };
  }

  switch (b.status) {
    case "completed":
      return { key: "completed", label: "✅ 客戶活動完成", variant: "muted", priority: 7 };
    case "no_show":
      return { key: "no_show", label: "⚠ 客戶未到場", variant: "coral", priority: 6 };
    case "cancelled_by_user":
      return { key: "cancelled_user", label: "⚪ 客戶取消", variant: "muted", priority: 9 };
    case "cancelled_by_weather":
      return { key: "cancelled_weather", label: "🌧 天氣取消", variant: "muted", priority: 9 };
    case "cancelled_unpaid":
      return { key: "cancelled_unpaid", label: "⛔ 訂單不成立", variant: "muted", priority: 9 };
    case "awaiting_verify":
      return { key: "awaiting_verify", label: "🟠 待確認匯款", variant: "gold", priority: 1 };
    case "confirmed":
      if (b.paymentStatus === "fully_paid") {
        return { key: "fully_paid", label: "🟢 已完成付款", variant: "default", priority: 4 };
      }
      if (b.paymentStatus === "deposit_paid") {
        return { key: "deposit_paid", label: "🔵 已確認付款（訂金）", variant: "default", priority: 3 };
      }
      // confirmed + pending — 罕見、視為等待付款
      return { key: "awaiting_pay", label: "🟡 等待付款", variant: "gold", priority: 2 };
    case "pending":
    default: {
      // 建立訂單 vs 等待付款 — 看是否過 D+1 且付款狀態 pending
      const created = typeof b.createdAt === "string" ? new Date(b.createdAt) : b.createdAt;
      const ageDays = (Date.now() - created.getTime()) / DAY_MS;
      if (b.paymentStatus === "pending" && ageDays >= 1) {
        return { key: "awaiting_pay", label: "🟡 等待付款", variant: "gold", priority: 2 };
      }
      return { key: "created", label: "🟡 建立訂單", variant: "gold", priority: 5 };
    }
  }
}

/**
 * 給 filter chips 用：依「訂單生命週期」時序排列 + 三層分組
 *
 * 第 1 層 正常流程：建立 → 等待付款 → 待確認匯款 → 已確認付款（訂金）→ 已完成付款 → 客戶活動完成
 * 第 2 層 結局/取消：客戶未到場 / 客戶取消 / 天氣取消 / 訂單不成立
 * 第 3 層 退款分支：退款處理中 → 已退款
 */
export const BOOKING_STATUS_FILTER_GROUPS: Array<{
  group: string;
  items: Array<{ key: BookingStatusKey; label: string }>;
}> = [
  {
    group: "正常流程",
    items: [
      { key: "created",         label: "🟡 建立訂單" },
      { key: "awaiting_pay",    label: "🟡 等待付款" },
      { key: "awaiting_verify", label: "🟠 待確認匯款" },
      { key: "deposit_paid",    label: "🔵 已確認付款（訂金）" },
      { key: "fully_paid",      label: "🟢 已完成付款" },
      { key: "completed",       label: "✅ 客戶活動完成" },
    ],
  },
  {
    group: "結局 / 取消",
    items: [
      { key: "no_show",           label: "⚠ 客戶未到場" },
      { key: "cancelled_user",    label: "⚪ 客戶取消" },
      { key: "cancelled_weather", label: "🌧 天氣取消" },
      { key: "cancelled_unpaid",  label: "⛔ 訂單不成立" },
    ],
  },
  {
    group: "退款",
    items: [
      { key: "refunding", label: "💸 退款處理中" },
      { key: "refunded",  label: "↩ 已退款" },
    ],
  },
];

/** 攤平版本（保留給其他地方用、例如查 label） */
export const BOOKING_STATUS_FILTER_KEYS: Array<{ key: BookingStatusKey; label: string }> =
  BOOKING_STATUS_FILTER_GROUPS.flatMap((g) => g.items);

/** 給後台 dashboard 顯示用 — derived key 是否屬於「老闆要處理」 */
export function isActionable(key: BookingStatusKey): boolean {
  return key === "awaiting_verify" || key === "awaiting_pay" || key === "refunding";
}
