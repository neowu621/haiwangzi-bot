import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorName: params.actorName,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // 日誌失敗不中斷主流程
  }
}
