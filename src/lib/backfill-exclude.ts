// v1081：一鍵補發的「個別排除」共用邏輯。
//
//   老闆看到補發名單時，可能有人不該發（員工帳號、已經用別的方式補償過、
//   帳號有爭議…）。這裡讓他把人從「這一批」拿掉，並且**必須寫原因**。
//
//   為什麼原因是必填：發錢與不發錢都是對客戶的決定，半年後有人問
//   「為什麼他有我沒有」，要查得到當時是誰、基於什麼理由拿掉的。
//   原因寫進 auditLog（稽核紀錄頁看得到），不是只存在瀏覽器裡。
//
//   ⚠️ 範圍只有「這一次」—— 下次打開補發對話框，這些人會再出現。
//      這是刻意的：排除理由常常是暫時的（這個月先不發），
//      永久排除應該是另一件事，不該由一個隨手按的「刪」造成。
import { logAudit } from "./audit";

export interface Exclusion {
  userId: string;
  /** 老闆填的原因（必填，空字串視為無效、該筆排除不生效） */
  reason: string;
}

/** 從 POST body 取出排除名單；格式不對一律回空陣列（寧可全發也不要誤刪）。 */
export function parseExclusions(body: unknown): Exclusion[] {
  if (typeof body !== "object" || body === null) return [];
  const raw = (body as { exclude?: unknown }).exclude;
  if (!Array.isArray(raw)) return [];
  const out: Exclusion[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const userId = (x as { userId?: unknown }).userId;
    const reason = (x as { reason?: unknown }).reason;
    if (typeof userId !== "string" || userId.trim() === "") continue;
    if (typeof reason !== "string" || reason.trim() === "") continue;
    out.push({ userId: userId.trim(), reason: reason.trim().slice(0, 200) });
  }
  return out;
}

/**
 * 把「這次排除了誰、為什麼」寫進稽核紀錄。
 * 一人一筆，之後在稽核紀錄頁用姓名或理由都查得到。
 */
export async function logExclusions(params: {
  kind: string; // signup_reward / birthday / first_order_reward
  kindLabel: string; // 給人看的：註冊禮金 / 生日禮金 / 首潛獎勵
  exclusions: Exclusion[];
  nameOf: (userId: string) => string | undefined;
  actorId: string;
  actorName?: string | null;
}): Promise<void> {
  for (const ex of params.exclusions) {
    await logAudit({
      actorId: params.actorId,
      actorName: params.actorName ?? undefined,
      action: "credit.backfill_excluded",
      targetType: "user",
      targetId: ex.userId,
      targetLabel: `${params.kindLabel}・${params.nameOf(ex.userId) ?? ex.userId.slice(0, 10)}`,
      metadata: { kind: params.kind, reason: ex.reason },
    });
  }
}
