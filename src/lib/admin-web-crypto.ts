import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/** 雜湊密碼，輸出格式 "salt:hash"（16-byte salt, 64-byte hash，皆 hex） */
export async function hashWebPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/** 驗證密碼是否符合存在 DB 的 hash */
export async function verifyWebPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, "hex");
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return timingSafeEqual(hashBuffer, derived);
  } catch {
    return false;
  }
}
