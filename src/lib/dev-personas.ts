// 開發模式：6 個虛擬身分
// 用於本地開發 / Zeabur 預覽，跳過 LINE 登入
// 啟用方式：
//  - server：env NODE_ENV !== "production" 或 DEV_MODE_ENABLED=1
//  - client：env NEXT_PUBLIC_LIFF_MOCK=1 或 NEXT_PUBLIC_DEV_MODE=1

import type { UserRole } from "@prisma/client";

export interface DevPersona {
  lineUserId: string;
  displayName: string;
  realName: string;
  roles: UserRole[];
  cert?: "OW" | "AOW" | "Rescue" | "DM" | "Instructor";
  certNumber?: string;
  phone?: string;
  email?: string;
  emoji: string; // UI 用
  description: string;
}

export const DEV_PERSONAS: DevPersona[] = [
  {
    lineUserId: "U_dev_customer_1",
    displayName: "小明",
    realName: "陳小明",
    roles: ["customer"],
    cert: "OW",
    certNumber: "PADI-OW-100001",
    phone: "0912-345001",
    email: "dev.customer1@example.com",
    emoji: "🐠",
    description: "新手客戶（OW）",
  },
  {
    lineUserId: "U_dev_customer_2",
    displayName: "小華",
    realName: "林小華",
    roles: ["customer"],
    cert: "AOW",
    certNumber: "PADI-AOW-100002",
    phone: "0912-345002",
    email: "dev.customer2@example.com",
    emoji: "🐢",
    description: "進階客戶（AOW，有歷史訂單）",
  },
  {
    lineUserId: "U_dev_coach_1",
    displayName: "阿凱教練",
    realName: "王阿凱",
    roles: ["coach"],
    cert: "Instructor",
    certNumber: "PADI-MSDT-200001",
    phone: "0912-345101",
    email: "dev.coach1@example.com",
    emoji: "🤿",
    description: "資深教練（Instructor）",
  },
  {
    lineUserId: "U_dev_coach_2",
    displayName: "阿志教練",
    realName: "陳阿志",
    roles: ["coach"],
    cert: "DM",
    certNumber: "PADI-DM-200002",
    phone: "0912-345102",
    email: "dev.coach2@example.com",
    emoji: "🦈",
    description: "潛水長（DM）",
  },
  {
    lineUserId: "U_dev_boss",
    displayName: "老闆娘",
    realName: "海老闆",
    roles: ["boss"],
    phone: "0912-345200",
    email: "dev.boss@example.com",
    emoji: "👩‍💼",
    description: "老闆（收款核對 / 開團 / 會員）",
  },
  {
    lineUserId: "U_dev_admin",
    displayName: "系統管理員",
    realName: "Admin",
    roles: ["admin"],
    phone: "0912-345300",
    email: "dev.admin@example.com",
    emoji: "🛠️",
    description: "管理員（全權限）",
  },
];

export function findDevPersona(lineUserId: string): DevPersona | undefined {
  return DEV_PERSONAS.find((p) => p.lineUserId === lineUserId);
}

export function isDevModeEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_MODE_ENABLED === "1"
  );
}
