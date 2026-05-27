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
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // shift to UTC+8
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function randomSuffix(): string {
  return CHARS[Math.floor(Math.random() * 36)] + CHARS[Math.floor(Math.random() * 36)];
}

async function genCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  const date = todayTW();
  for (let i = 0; i < 50; i++) {
    const code = `${prefix}${date}-${randomSuffix()}`;
    if (!(await exists(code))) return code;
  }
  throw new Error(`Failed to generate unique ${prefix} code (50 attempts exhausted)`);
}

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
