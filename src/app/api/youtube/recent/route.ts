/**
 * GET /api/youtube/recent
 *
 * Returns the 5 most-recent uploads from the 東北角海王子 YouTube channel
 * by reading the public Atom RSS feed (no API key needed).
 *
 * Cached at the route-level for 1 hour via Next.js fetch cache + ISR
 * revalidate. The feed itself is also cached by YouTube's CDN.
 *
 * Each entry returns:
 *   - id:    YouTube video id (11 chars)
 *   - title: video title
 *   - isShort: true if the canonical link is /shorts/...
 *
 * Fallback: on parse / network error returns `{ videos: [], error: "..." }`
 * so the client can degrade gracefully (show "暫無影片" or hide section).
 */
export const revalidate = 3600; // re-fetch RSS hourly

const CHANNEL_ID = "UCb5mvHLLupJfLPgbrQQV_sA"; // 東北角海王子

type Video = { id: string; title: string; isShort: boolean };

export async function GET() {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HaiwangziBot/1.0)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return jsonResponse({ videos: [], error: `RSS HTTP ${res.status}` });
    }
    const xml = await res.text();

    // Match each <entry>…</entry> block then extract videoId, title, link.
    const blocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    const videos: Video[] = [];
    for (const m of blocks) {
      const block = m[1];
      const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const title = decodeXml(block.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
      const linkHref = block.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "";
      if (!id) continue;
      videos.push({
        id,
        title,
        isShort: linkHref.includes("/shorts/"),
      });
      if (videos.length >= 15) break; // v406：多抓一些，讓前端能扣除排除/Shorts後仍足量
    }

    return jsonResponse({ videos });
  } catch (e) {
    return jsonResponse({
      videos: [],
      error: e instanceof Error ? e.message : "fetch failed",
    });
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Browser / edge cache for 5 min, allow CDN to serve stale up to 1 day
      // while it refetches in the background.
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
