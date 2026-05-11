import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

// 雙 bucket：
//  - public：潛點照片、Rich Menu 縮圖、頭像（可公開預覽）
//  - private：轉帳截圖、敏感檔案（presigned GET 才看得到）
export const R2_PUBLIC_BUCKET =
  process.env.R2_PUBLIC_BUCKET ?? process.env.R2_BUCKET ?? "haiwangzi-public";
export const R2_PRIVATE_BUCKET =
  process.env.R2_PRIVATE_BUCKET ?? "haiwangzi-private";
export const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "";

let _client: S3Client | null = null;

export function r2Client(): S3Client {
  if (_client) return _client;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "R2 not configured: 請設定 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY",
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function r2Configured(): boolean {
  return Boolean(accessKeyId && secretAccessKey && endpoint);
}

export type R2Prefix = "payments" | "sites" | "avatars" | "richmenu";

/** prefix → bucket 對應 */
export function bucketFor(prefix: R2Prefix): string {
  if (prefix === "payments" || prefix === "avatars") return R2_PRIVATE_BUCKET;
  return R2_PUBLIC_BUCKET; // sites, richmenu
}

export function isPrivate(prefix: R2Prefix): boolean {
  return bucketFor(prefix) === R2_PRIVATE_BUCKET;
}

/** 產生 R2 key，含時間戳避免衝突 */
export function makeKey(
  prefix: R2Prefix,
  filename: string,
  scope?: string,
): string {
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf("."))
    : "";
  const rand = randomBytes(8).toString("hex");
  const ts = Date.now();
  const parts = [prefix, scope, `${ts}-${rand}${ext}`].filter(Boolean);
  return parts.join("/");
}

/** Presigned PUT URL，用於瀏覽器端直傳 */
export async function presignPutUrl(
  prefix: R2Prefix,
  key: string,
  contentType: string,
  ttlSec = 300,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucketFor(prefix),
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(r2Client(), cmd, { expiresIn: ttlSec });
}

/** Presigned GET URL — 私密 bucket 暫時下載用 */
export async function presignGetUrl(
  prefix: R2Prefix,
  key: string,
  ttlSec = 600,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucketFor(prefix), Key: key });
  return await getSignedUrl(r2Client(), cmd, { expiresIn: ttlSec });
}

/** Public URL builder（僅 public bucket 適用） */
export function publicUrl(key: string): string {
  if (!R2_PUBLIC_URL) return key;
  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

/** prefix → 預覽用 URL（private 走 presigned GET，public 走直連） */
export async function previewUrl(
  prefix: R2Prefix,
  key: string,
): Promise<string> {
  if (isPrivate(prefix)) return await presignGetUrl(prefix, key, 600);
  return publicUrl(key);
}

export async function deleteObject(prefix: R2Prefix, key: string) {
  await r2Client().send(
    new DeleteObjectCommand({ Bucket: bucketFor(prefix), Key: key }),
  );
}
