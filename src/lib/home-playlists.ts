// v946：首頁「潛點主題播放清單牆」資料 —— 後台可編輯，存 siteConfig.homePlaylists。
//   點磚 → 開該 YouTube 播放清單。縮圖優先序：上傳封面(coverImageUrl,B) > 代表影片縮圖(coverVideoId,A) > 漸層底。
import { ytThumb } from "./dive-videos";

export interface HomePlaylist {
  playlistId: string;    // YouTube 播放清單 id（網址 list=...）
  title: string;         // 地點名稱
  coverVideoId: string;  // 代表影片 id（A：用它的 YT 縮圖）
  coverImageUrl: string; // 上傳封面（B：優先於 coverVideoId）
}

// 起始 3 個（老闆給的東北角主題清單；深奧/龜山島 ID 待補，後台可增/改/刪）
export const DEFAULT_HOME_PLAYLISTS: HomePlaylist[] = [
  { playlistId: "PLbKSEhfZ0kX7KpilsKEn12HmpTwJTO041", title: "東北角 82.8K", coverVideoId: "", coverImageUrl: "" },
  { playlistId: "PLbKSEhfZ0kX6mq6rrLqKPSi13POn4NfdC", title: "東北角萊萊鶯歌石", coverVideoId: "", coverImageUrl: "" },
  { playlistId: "PLbKSEhfZ0kX7m_TySjJ66OiPgVnw4u-6P", title: "台灣蘭嶼", coverVideoId: "", coverImageUrl: "" },
];

// 從各種 YouTube 網址抽出 playlist id（?list= / &list= / 純 id）
export function parsePlaylistId(url: string): string | null {
  const s = (url || "").trim();
  if (!s) return null;
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^(PL|UU|FL|OL|RD)[A-Za-z0-9_-]{6,}$/.test(s)) return s; // 純 id
  return null;
}
export function playlistUrl(id: string): string {
  return `https://www.youtube.com/playlist?list=${id}`;
}
// 縮圖來源（空字串 → 前端顯示漸層底 + 標題）
export function playlistThumb(p: HomePlaylist): string {
  if (p.coverImageUrl) return p.coverImageUrl;
  if (p.coverVideoId) return ytThumb(p.coverVideoId);
  return "";
}

export function sanitizeHomePlaylists(raw: unknown): HomePlaylist[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> =>
      !!v && typeof v === "object" && typeof (v as { playlistId?: unknown }).playlistId === "string" && ((v as { playlistId: string }).playlistId).length > 0)
    .map((v) => ({
      playlistId: String(v.playlistId).slice(0, 60),
      title: typeof v.title === "string" ? v.title.slice(0, 60) : "",
      coverVideoId: typeof v.coverVideoId === "string" ? v.coverVideoId.slice(0, 20) : "",
      coverImageUrl: typeof v.coverImageUrl === "string" ? v.coverImageUrl.slice(0, 500) : "",
    }))
    .slice(0, 12);
}
