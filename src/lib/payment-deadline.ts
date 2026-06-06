// v367：統一「付款截止日」算法。
//   截止日 = min( 下訂日 + 10 天 , 活動出發前 48 小時 )
//   修正先前 bug：純用「下訂+10天」會讓截止日落在活動日之後（例如 6/6 下訂、6/11 活動 → 截止 6/16，比活動還晚，毫無意義）。
//   activityStart 為 null（無精確出發時間）時，退回只用 D+10。
export const PAYMENT_WINDOW_DAYS = 10;
export const PRE_ACTIVITY_CUTOFF_HOURS = 48;

export function computePaymentDeadline(
  createdAt: Date | string,
  activityStart: Date | string | null,
): Date {
  const created = new Date(createdAt);
  const d10 = new Date(created);
  d10.setDate(d10.getDate() + PAYMENT_WINDOW_DAYS);
  if (!activityStart) return d10;
  const start = new Date(activityStart);
  if (isNaN(start.getTime())) return d10;
  const cutoff = new Date(start.getTime() - PRE_ACTIVITY_CUTOFF_HOURS * 60 * 60 * 1000);
  return cutoff < d10 ? cutoff : d10;
}

// 由場次日期字串 + 開始時間（HH:mm）組出台北時區的活動出發 instant。
//   dateStr: "YYYY-MM-DD"；startTime: "HH:mm"（可空）
export function activityStartFromTaipei(
  dateStr: string | null | undefined,
  startTime?: string | null,
): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T${startTime && startTime.length >= 4 ? startTime : "00:00"}:00+08:00`);
  return isNaN(d.getTime()) ? null : d;
}
