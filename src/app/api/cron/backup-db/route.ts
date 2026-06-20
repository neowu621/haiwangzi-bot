import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { gzip as gzipCb } from "node:zlib";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gzip = promisify(gzipCb);

/**
 * POST /api/cron/backup-db
 *
 * 從容器內執行 pg_dump，gzip 後上傳 R2 private bucket。
 * 在 Zeabur 環境內可存取內部 postgres host（${POSTGRES_HOST} 等都有解析）。
 * GitHub Actions 從外部觸發只負責呼叫此 endpoint。
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 *
 * 順帶：保留最近 30 天 + 每月第一天 12 個月 + 每年第一天無限
 *      （簡化版：先保留最近 60 天，超過自動刪）
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }
  const bucket = process.env.R2_PRIVATE_BUCKET ?? "haiwangzi-private";
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: "R2 env not configured" }, { status: 500 });
  }

  const dateStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const filename = `haiwangzi-db-${dateStr.replace(/-/g, "")}.sql.gz`;

  try {
    // 1. 跑 pg_dump → 收集 stdout buffer
    const sqlBuf = await runPgDump(dbUrl);
    if (sqlBuf.length === 0) {
      return NextResponse.json({ error: "pg_dump returned empty output" }, { status: 500 });
    }

    // 2. gzip
    const gzBuf = await gzip(sqlBuf, { level: 9 });

    // 3. upload to R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const key = `db-backups/${filename}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: gzBuf,
        ContentType: "application/gzip",
        ContentEncoding: "gzip",
      }),
    );

    // 4. 清理 60 天前的舊備份
    let deleted = 0;
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const list = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: "db-backups/" }),
      );
      const toDelete =
        list.Contents?.filter(
          (o) => o.LastModified && o.LastModified < sixtyDaysAgo,
        ) ?? [];
      if (toDelete.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: toDelete.map((o) => ({ Key: o.Key! })) },
          }),
        );
        deleted = toDelete.length;
      }
    } catch (e) {
      console.warn("[backup-db cleanup]", e);
    }

    return NextResponse.json({
      ok: true,
      filename,
      key,
      sizeBytes: gzBuf.length,
      rawSize: sqlBuf.length,
      oldBackupsDeleted: deleted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[backup-db]", e);
    return NextResponse.json({ error: `backup failed: ${msg}` }, { status: 500 });
  }
}

/** 跑 pg_dump 並回 stdout buffer。失敗時 throw 詳細 stderr */
function runPgDump(dbUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      [dbUrl, "--no-owner", "--no-privileges", "--format=plain"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        reject(new Error(`pg_dump exit ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
  });
}
