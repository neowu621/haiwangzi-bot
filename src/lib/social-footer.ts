/**
 * v344：社群連結 footer — 自動附加到所有 LINE / Email 訊息結尾
 *
 * 來源：siteConfig.externalLinks（fbGroupUrl / youtubeChannelUrl / instagramUrl）
 * 由 admin 在「系統設定 → 外部連結」維護。
 *
 * 用法：
 *   - LINE：getLineClient() 已自動在最後一則 text 訊息附加 lineText
 *   - Email：sendEmail() 已自動在 html 結尾附加 emailHtml
 * 不需在 call site 手動加。
 *
 * 5 分鐘記憶體快取，避免每則訊息打 DB。
 */
import { prisma } from "./prisma";

export interface SocialFooter {
  lineText: string;   // 接在 LINE text 訊息結尾（含分隔線；無連結時為空字串）
  emailHtml: string;  // 接在 Email html 結尾（無連結時為空字串）
}

interface ExternalLinks {
  websiteUrl?: string; // v583：官方網站
  fbGroupUrl?: string;
  youtubeChannelUrl?: string;
  instagramUrl?: string;
}

let _cache: { footer: SocialFooter; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function invalidateSocialFooterCache(): void {
  _cache = null;
}

export async function getSocialFooter(): Promise<SocialFooter> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.footer;

  let links: ExternalLinks = {};
  try {
    const row = await prisma.siteConfig.findUnique({
      where: { id: "default" },
      select: { externalLinks: true },
    });
    links = (row?.externalLinks as ExternalLinks | null) ?? {};
  } catch {
    // DB 失敗 → 回空 footer，不影響主訊息
  }

  const web = links.websiteUrl?.trim();
  const fb = links.fbGroupUrl?.trim();
  const yt = links.youtubeChannelUrl?.trim();
  const ig = links.instagramUrl?.trim();

  // LINE 文字版
  const lineLines: string[] = [];
  if (web) lineLines.push(`🌐 官網：${web}`);
  if (fb) lineLines.push(`📘 Facebook：${fb}`);
  if (yt) lineLines.push(`▶️ YouTube：${yt}`);
  if (ig) lineLines.push(`📷 Instagram：${ig}`);
  const lineText = lineLines.length
    ? `\n\n━━━━━━━━━\n追蹤我們，最新潛點＆活動不錯過：\n${lineLines.join("\n")}`
    : "";

  // Email HTML 版
  const parts: string[] = [];
  if (web) parts.push(`<a href="${web}" style="color:#0a8f86;text-decoration:none">官方網站</a>`);
  if (fb) parts.push(`<a href="${fb}" style="color:#1877F2;text-decoration:none">Facebook</a>`);
  if (yt) parts.push(`<a href="${yt}" style="color:#FF0000;text-decoration:none">YouTube</a>`);
  if (ig) parts.push(`<a href="${ig}" style="color:#E1306C;text-decoration:none">Instagram</a>`);
  const emailHtml = parts.length
    ? `<hr style="margin:24px 0 12px;border:none;border-top:1px solid #e5e7eb" />
       <p style="font-size:12px;color:#6b7280;line-height:1.6">追蹤我們，最新潛點＆活動不錯過：<br>${parts.join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const footer: SocialFooter = { lineText, emailHtml };
  _cache = { footer, at: Date.now() };
  return footer;
}
