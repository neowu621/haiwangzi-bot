// v210：統一的中英對照表，前台/後台共用
// 後端 enum 用英文（DB / API），UI 顯示一律走這個 helper

export const ROLE_LABEL_CN: Record<string, string> = {
  customer: "會員",
  coach: "教練",
  boss: "老闆",
  admin: "代理人", // v758：原「管理員」→「代理人」（老闆代理；enum 值維持 admin）
};

export const CERT_LABEL_CN: Record<string, string> = {
  OW: "開放水域",
  AOW: "進階",
  Rescue: "救援",
  DM: "潛水長",
  Instructor: "潛水教練",
};

/** 教練專屬等級（Coach.cert）翻譯 — 比 User.cert 多了 CourseDirector */
export const COACH_CERT_LABEL_CN: Record<string, string> = {
  DM: "潛水長",
  Instructor: "潛水教練",
  CourseDirector: "課程總監",
};

export function roleLabel(r: string | null | undefined): string {
  if (!r) return "—";
  return ROLE_LABEL_CN[r] ?? r;
}

export function certLabel(c: string | null | undefined): string {
  if (!c) return "—";
  return CERT_LABEL_CN[c] ?? COACH_CERT_LABEL_CN[c] ?? c;
}
