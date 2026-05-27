/**
 * 唯一編號產生器
 * Booking  → O-XXXXXX  (6位大寫英數)
 * DivingTrip → D-XXXXXX
 * TourPackage → T-XXXXXX
 */
import { prisma } from "./prisma";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomSuffix(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

export async function genBookingCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = "O-" + randomSuffix(6);
    const exists = await prisma.booking.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique booking code after 20 attempts");
}

export async function genTripCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = "D-" + randomSuffix(6);
    const exists = await prisma.divingTrip.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique trip code after 20 attempts");
}

export async function genTourCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = "T-" + randomSuffix(6);
    const exists = await prisma.tourPackage.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique tour code after 20 attempts");
}
