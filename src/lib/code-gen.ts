/**
 * 唯一編號產生器 — 格式：{P}{YYYYMMDD}-{XX}
 *   P  = M(Member) | D(DivingTrip) | T(TourPackage) | O(Order/Booking)
 *   YYYYMMDD = 建立日期（UTC+8 台灣時間）
 *   XX = 2 位 base-36 大寫英數（0-9 A-Z），共 36²=1296 種，碰撞時 retry
 *
 * 範例：M20260528-3A  D20260528-ZZ  T20260528-01  O20260528-B7
 */
import { prisma } from "./prisma";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 取台灣當天日期字串 YYYYMMDD（UTC+8）*/
function todayTW(): string {
  return formatDateTW(new Date());
}

/** 將 Date 轉為台灣日期字串 YYYYMMDD（UTC+8）*/
export function formatDateTW(date: Date): string {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000); // shift to UTC+8
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function randomSuffix(): string {
  return CHARS[Math.floor(Math.random() * 36)] + CHARS[Math.floor(Math.random() * 36)];
}

/** 用指定日期字串產生唯一編號（供補發舊資料使用）*/
async function genCodeWithDate(
  prefix: string,
  dateStr: string,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = `${prefix}${dateStr}-${randomSuffix()}`;
    if (!(await exists(code))) return code;
  }
  throw new Error(`Failed to generate unique ${prefix} code for date ${dateStr} (50 attempts exhausted)`);
}

/** 用今天日期產生唯一編號（供新建記錄使用）*/
async function genCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  return genCodeWithDate(prefix, todayTW(), exists);
}

// ── 新建記錄用（使用今日日期）──────────────────────────────────────────────

export async function genMemberCode(): Promise<string> {
  return genCode("M", async (code) => !!(await prisma.user.findUnique({ where: { code } })));
}

export async function genTripCode(): Promise<string> {
  return genCode("D", async (code) => !!(await prisma.divingTrip.findUnique({ where: { code } })));
}

export async function genTourCode(): Promise<string> {
  return genCode("T", async (code) => !!(await prisma.tourPackage.findUnique({ where: { code } })));
}

export async function genBookingCode(): Promise<string> {
  return genCode("O", async (code) => !!(await prisma.booking.findUnique({ where: { code } })));
}

// ── 補發舊資料用（使用 createdAt 日期）────────────────────────────────────

export async function genMemberCodeForDate(createdAt: Date): Promise<string> {
  return genCodeWithDate("M", formatDateTW(createdAt), async (code) => !!(await prisma.user.findUnique({ where: { code } })));
}

export async function genTripCodeForDate(createdAt: Date): Promise<string> {
  return genCodeWithDate("D", formatDateTW(createdAt), async (code) => !!(await prisma.divingTrip.findUnique({ where: { code } })));
}

export async function genTourCodeForDate(createdAt: Date): Promise<string> {
  return genCodeWithDate("T", formatDateTW(createdAt), async (code) => !!(await prisma.tourPackage.findUnique({ where: { code } })));
}

export async function genBookingCodeForDate(createdAt: Date): Promise<string> {
  return genCodeWithDate("O", formatDateTW(createdAt), async (code) => !!(await prisma.booking.findUnique({ where: { code } })));
}
