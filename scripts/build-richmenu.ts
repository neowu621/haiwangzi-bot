/**
 * 產出三個角色的 Rich Menu PNG (2500 × 1686 px, 6 格 2×3)
 * 使用 @napi-rs/canvas (Windows + Alpine 都能跑)
 *
 *   npx tsx scripts/build-richmenu.ts
 *
 * 輸出檔案：
 *   public/richmenu/customer.png
 *   public/richmenu/coach.png
 *   public/richmenu/admin.png
 */
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";

const W = 2500;
const H = 1686;

interface Cell {
  label: string;
  sub?: string;
  accent?: string; // 該格特別強調
}

const MENUS: Record<"customer" | "coach" | "admin", Cell[]> = {
  customer: [
    { label: "日潛預約", sub: "Calendar", accent: "#00D9CB" },
    { label: "潛水團", sub: "Tour Packages" },
    { label: "我的預約", sub: "My Bookings" },
    { label: "價目·證照", sub: "Pricing" },
    { label: "我的資料", sub: "Profile" },
    { label: "聯絡教練", sub: "Contact" },
  ],
  coach: [
    { label: "今日場次", sub: "Today", accent: "#00D9CB" },
    { label: "簽到表", sub: "Roster" },
    { label: "收款核對", sub: "Payments" },
    { label: "海況/取消", sub: "Weather" },
    { label: "我的學員", sub: "Students" },
    { label: "提醒推播", sub: "Push" },
  ],
  admin: [
    { label: "模板管理", sub: "Templates", accent: "#00D9CB" },
    { label: "排班/場次", sub: "Schedule" },
    { label: "營運報表", sub: "Reports" },
    { label: "訂金/尾款", sub: "Payments" },
    { label: "群發推播", sub: "Broadcast" },
    { label: "系統設定", sub: "Settings" },
  ],
};

function drawMenu(cells: Cell[]) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 背景 (深海漸層)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1B3A5C");
  grad.addColorStop(1, "#0A2342");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 6 格分隔線
  const cellW = W / 3;
  const cellH = H / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const x = c * cellW;
      const y = r * cellH;
      const cell = cells[i];

      // 強調格背景
      if (cell.accent) {
        ctx.fillStyle = "rgba(0,217,203,0.10)";
        ctx.fillRect(x, y, cellW, cellH);
      }

      // 邊框
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);

      // 文字
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 主標
      ctx.fillStyle = cell.accent ?? "#ffffff";
      ctx.font = `bold 96px "Noto Sans TC", "PingFang TC", sans-serif`;
      ctx.fillText(cell.label, x + cellW / 2, y + cellH / 2 - 30);

      // 副標
      if (cell.sub) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `500 40px Inter, system-ui, sans-serif`;
        ctx.fillText(cell.sub, x + cellW / 2, y + cellH / 2 + 60);
      }
    }
  }

  return canvas.toBuffer("image/png");
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "richmenu");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [role, cells] of Object.entries(MENUS)) {
    const buf = drawMenu(cells);
    const file = path.join(outDir, `${role}.png`);
    fs.writeFileSync(file, buf);
    console.log(`[richmenu] wrote ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  console.log("[richmenu] 完成。下一步：呼叫 POST /api/admin/richmenu/sync");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
