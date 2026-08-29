// v1069：LINE 推播的「安靜時段」。
//
// 規則：系統自動發送的 LINE 一律只在 09:00–22:00（台北時間）之間推。
//   半夜把老闆或客戶吵醒，訊息本身再有用也是扣分。
//
// 例外：**客戶自己剛做完某個動作**（下單、上傳付款證明、送出申請…）而產生的回覆，
//   不受此限 —— 那是他當下正在等的回應，凌晨三點下單就該凌晨三點收到確認。
//   實作方式是「預設不套用，需要的呼叫端明確帶 respectQuietHours: true」，
//   所以新增自動發送流程時要記得帶上。
//
// 站內通知與 Email 不受影響：它們不會主動發出聲響，隔天看到即可。

export const QUIET_START_HOUR = 9;  // 09:00 前不推
export const QUIET_END_HOUR = 22;   // 22:00 後不推

/** 現在（台北時間）是否落在不該推播的時段。 */
export function isQuietHours(now: Date = new Date()): boolean {
  const hour = Number(
    now.toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }),
  );
  return hour < QUIET_START_HOUR || hour >= QUIET_END_HOUR;
}

/** 給 log 用的說明字串。 */
export function quietHoursNote(): string {
  return `安靜時段（${QUIET_START_HOUR}:00–${QUIET_END_HOUR}:00 以外）不推 LINE`;
}
