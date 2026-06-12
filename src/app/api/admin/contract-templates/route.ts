import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildContractDefault, buildContractRefUrl } from "@/lib/default-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v475：合約範本（客製訂單的合約類別 + 條款）— 老闆自行編輯
const DEFAULTS = [
  { category: "ow", title: "OW 開放水域潛水員課程", sortOrder: 1 },
  { category: "aow", title: "AOW 進階開放水域潛水員課程", sortOrder: 2 },
  { category: "oneonone", title: "1對1 潛水輔導課程", sortOrder: 3 },
  { category: "discover", title: "體驗潛水課程", sortOrder: 4 },
  { category: "other", title: "其他客製方案", sortOrder: 9 },
];
const PLACEHOLDER = "（請填入本合約完整條款：課程內容、堂數、費用、退費規定、保險、安全須知、責任歸屬等。簽署後將產生 PDF 存檔。）";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  let rows = await prisma.contractTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  // 首次：自動建立 5 個預設類別，內容直接帶入「建議條款」（老闆仍可編輯覆蓋）
  if (rows.length === 0) {
    await prisma.contractTemplate.createMany({
      data: DEFAULTS.map((d) => ({ ...d, content: buildContractDefault(d.category, d.title), refUrl: buildContractRefUrl(d.category) || null })),
      skipDuplicates: true,
    });
    rows = await prisma.contractTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  }
  // v512/v513：把還是「空白／舊佔位字」的條款補上建議條款；參考連結（refUrl）空的補上對應 /guide 連結。
  //   已自填的內容與連結都不覆蓋。
  const updates = rows.filter((r) => {
    const needContent = !r.content?.trim() || r.content.trim() === PLACEHOLDER;
    const needRef = !!buildContractRefUrl(r.category) && !r.refUrl?.trim();
    return needContent || needRef;
  });
  if (updates.length > 0) {
    await Promise.all(
      updates.map((r) => {
        const data: { content?: string; refUrl?: string } = {};
        if (!r.content?.trim() || r.content.trim() === PLACEHOLDER) data.content = buildContractDefault(r.category, r.title);
        const wantRef = buildContractRefUrl(r.category);
        if (wantRef && !r.refUrl?.trim()) data.refUrl = wantRef;
        return prisma.contractTemplate.update({ where: { category: r.category }, data });
      }),
    );
    rows = await prisma.contractTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return NextResponse.json({ templates: rows });
}

const PatchSchema = z.object({
  category: z.string().min(1).max(32),
  title: z.string().min(1).max(128),
  content: z.string().max(20000),
  refUrl: z.string().max(2000).nullable().optional().or(z.literal("")),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const d = PatchSchema.parse(await req.json());
  const row = await prisma.contractTemplate.upsert({
    where: { category: d.category },
    create: {
      category: d.category,
      title: d.title,
      content: d.content,
      refUrl: d.refUrl || null,
      active: d.active ?? true,
      sortOrder: d.sortOrder ?? 0,
      updatedBy: auth.user.lineUserId,
    },
    update: {
      title: d.title,
      content: d.content,
      refUrl: d.refUrl || null,
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
      updatedBy: auth.user.lineUserId,
    },
  });
  return NextResponse.json({ ok: true, template: row });
}
