// v911：首頁「本週潛水精選」影片資料 —— 後台可編輯，存 siteConfig.featuredDiveVideos。
//   category: latest=🆕本週最新(大卡) / best=⭐近期最佳(小卡)。點卡片直接開 YouTube。
export type DiveVideoCategory = "latest" | "best";
export interface DiveVideo {
  id: string;            // YouTube videoId
  isShort: boolean;      // 是否為 Shorts（縮圖比例提示用）
  category: DiveVideoCategory;
  title: string;
  desc: string;
}

// 起始 4 支（老闆挑的東北角 82.8K 系列；後台可改/增/刪）
export const DEFAULT_DIVE_VIDEOS: DiveVideo[] = [
  { id: "oQsw94fTVKM", isShort: false, category: "latest", title: "東北角 82.8K｜沉船履帶殘骸探索", desc: "跟汪汪潛進 82.8K，探索沉船履帶殘骸，海裡藏著故事。" },
  { id: "GOJuHKxdCH4", isShort: true, category: "best", title: "82.8K 氮醉花園・紅甘魚群風暴", desc: "" },
  { id: "xjEnxL9ZCTM", isShort: false, category: "best", title: "82.8K 黑雀鯛群礁區", desc: "" },
  { id: "aLwWxok9aN4", isShort: false, category: "best", title: "82.8K 巨大甲貝魚群", desc: "" },
];

// 從各種 YouTube 網址抽出 videoId（watch?v= / youtu.be/ / shorts/ / embed/）
export function parseYouTubeId(url: string): string | null {
  const s = (url || "").trim();
  if (!s) return null;
  // 純 id（11 碼）
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/shorts\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export function isShortsUrl(url: string): boolean {
  return /\/shorts\//.test(url || "");
}
export function ytWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
export function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// 從原始物件陣列淨化成 DiveVideo[]（給 API 讀寫用）
export function sanitizeDiveVideos(raw: unknown): DiveVideo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && ((v as { id: string }).id).length > 0)
    .map((v) => ({
      id: String(v.id),
      isShort: !!v.isShort,
      category: (v.category === "latest" ? "latest" : "best") as DiveVideoCategory,
      title: typeof v.title === "string" ? v.title.slice(0, 120) : "",
      desc: typeof v.desc === "string" ? v.desc.slice(0, 300) : "",
    }))
    .slice(0, 12);
}
