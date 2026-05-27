import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── 台北時區 (GMT+8) 日期格式化工具 ──────────────────────────────

/** 回傳 "YYYY/MM/DD"（台北時區）*/
export function toTaipeiDateString(isoOrDate: string | Date): string {
  return new Date(isoOrDate).toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 回傳 "YYYY-MM-DD"（台北時區，用於 <input type="date"> value）*/
export function toTaipeiISODate(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return "";
  return new Date(isoOrDate).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Taipei",
  });
}

/** 回傳 "YYYY-MM-DD HH:mm:ss"（台北時區）*/
export function toTaipeiDateTimeString(isoOrDate: string | Date): string {
  const d = new Date(isoOrDate);
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const time = d.toLocaleTimeString("sv-SE", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** 取得今天台北時區的 YYYY-MM-DD（給 form 預設值用）*/
export function taipeiToday(): string {
  return toTaipeiISODate(new Date());
}

/** 取得台北時區的星期（"週日"…"週六"）*/
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
export function weekdayTW(dateStr: string): string {
  if (!dateStr) return "";
  // 在 dateStr 加上 +08:00 讓 Date 正確解析為台北時區的當天
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00+08:00`);
  return `週${WEEKDAYS[d.getDay()]}`;
}
