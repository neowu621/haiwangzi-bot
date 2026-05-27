import { prisma } from "@/lib/prisma";

export interface AuditParams {
  actorId?: string;
  actorName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 記錄後台操作日誌（fire-and-forget，不影響主流程）
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({ data: params });
  } catch {
    // 日誌失敗不中斷主流程
  }
}
