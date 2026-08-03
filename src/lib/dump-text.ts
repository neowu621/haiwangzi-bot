// v1001：Dump 潛水資訊文字產生器 —— 從 admin/trips 抽出成共用函式，桌機後台與手機後台共用。
//   任何 dump 格式調整都改這裡一處，兩邊同步。
import { liffAppUrl } from "./liff-url";

export interface DumpTripInput {
  date: string;            // YYYY-MM-DD
  startTime: string;       // "08:00"
  diveSiteIds: string[];
  tankCount: number;
  isNightDive?: boolean;
  status?: string;
}
export interface DumpTourInput {
  dateStart: string;
  dateEnd: string;
  title: string;
  durationLabel?: string | null;
  status?: string;
}
export interface DumpSite { id: string; name: string }

export interface BuildDumpOpts {
  mode?: "line" | "fb";
  startDate: string; // YYYY-MM-DD
  days: number;
  trips: DumpTripInput[];
  tours: DumpTourInput[];
  sites: DumpSite[];
  baseUrl: string;
  promo?: { enabled: boolean; text: string };
  footer?: { enabled: boolean; text: string };
  fbTags?: string;
}

const SUPPORT_LINE = "https://line.me/R/ti/p/@894bpmew";

export function buildDumpText(o: BuildDumpOpts): string {
  const mode = o.mode ?? "line";
  const promo = o.promo ?? { enabled: false, text: "" };
  const footer = o.footer ?? { enabled: true, text: "" };
  const fbTags = o.fbTags ?? "";
  const baseUrl = o.baseUrl;
  const start = new Date(`${o.startDate}T00:00:00+08:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, o.days) - 1);
  const fmtMD = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const weekdayMap = ["日", "一", "二", "三", "四", "五", "六"];
  const inRange = o.trips.filter((t) => {
    const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
    return td >= start && td <= end && t.status !== "cancelled";
  });
  inRange.sort((a, b) => {
    const da = a.date.slice(0, 10), db = b.date.slice(0, 10);
    if (da !== db) return da < db ? -1 : 1;
    return a.startTime.localeCompare(b.startTime);
  });
  const siteName = (id: string) => o.sites.find((s) => s.id === id)?.name ?? id;
  const fmtMDs = (s: string) => { const p = s.slice(0, 10).split("-"); return `${p[1]}/${p[2]}`; };
  const noteLines = () => [
    "💡 日潛 3 支：",
    "岸潛 第一支 08:00 / 第二支 09:30 / 第三支 13:00，可依體能與時段需求選擇參加",
    "船潛依據地點、時間不同 請與教練確認",
  ];

  // ── FB 貼文版 ──
  if (mode === "fb") {
    const toursFb = o.tours.filter((t) => {
      if (t.status === "cancelled") return false;
      const sd = new Date(`${t.dateStart.slice(0, 10)}T00:00:00+08:00`);
      return sd >= start && sd <= end;
    }).sort((a, b) => (a.dateStart.slice(0, 10) < b.dateStart.slice(0, 10) ? -1 : 1));
    const fb: string[] = [];
    fb.push("🌊 東北角海王子・日潛開放預約 🤿");
    if (promo.enabled && promo.text.trim()) {
      fb.push("");
      fb.push(...promo.text.trim().split("\n").map((s) => s.trimEnd()).filter((s) => s !== ""));
    }
    fb.push("");
    if (inRange.length === 0) {
      fb.push("📅 日潛場次");
      fb.push("・場次陸續安排中，先追蹤粉專不錯過！");
    } else {
      const dts = inRange.map((t) => new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`)).sort((a, b) => a.getTime() - b.getTime());
      const f = dts[0], l = dts[dts.length - 1];
      fb.push(`📅 日潛場次 ${fmtMD(f)}(週${weekdayMap[f.getDay()]}) ~ ${fmtMD(l)}(週${weekdayMap[l.getDay()]})`);
      for (const t of inRange) {
        const d = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
        const wd = weekdayMap[d.getDay()];
        const sitesStr = t.diveSiteIds.map(siteName).join("·") || "未設潛點";
        const moon = t.isNightDive ? "🌙" : "";
        fb.push(`・${fmtMD(d)}(週${wd}) ${t.startTime} ${moon}${sitesStr} ${t.tankCount}支`);
      }
      noteLines().forEach((l) => fb.push(l));
    }
    if (toursFb.length > 0) {
      fb.push("");
      fb.push("⛴️ 國內外潛水旅行團 歡迎報名參加");
      for (const t of toursFb) {
        const range = t.dateStart.slice(0, 10) === t.dateEnd.slice(0, 10) ? fmtMDs(t.dateStart) : `${fmtMDs(t.dateStart)}–${fmtMDs(t.dateEnd)}`;
        const dur = t.durationLabel ? `（${t.durationLabel}）` : "";
        fb.push(`・${range} ${t.title}${dur}`);
      }
    }
    fb.push("");
    fb.push("📱 手機點連結，用 LINE 直接預約（可累積潛水送抵用金）");
    fb.push(`👉 ${baseUrl}/d`);
    fb.push("");
    fb.push("🔗 有潛水問題歡迎聯繫汪汪：");
    fb.push(`站內訊息 ${liffAppUrl("/messages")}`);
    fb.push(`LINE ${SUPPORT_LINE}`);
    if (fbTags.trim()) { fb.push(""); fb.push(fbTags.trim()); }
    return fb.join("\n");
  }

  // ── LINE 筆記本版 ──
  const lines: string[] = [];
  const HR = "━━━━━━━━━━━━━━";
  lines.push(`🔱 東北角海王子官網 ${baseUrl}`);
  if (promo.enabled && promo.text.trim()) {
    lines.push(...promo.text.trim().split("\n").map((s) => s.trimEnd()).filter((s) => s !== ""));
  }
  lines.push(HR);
  lines.push("📱 請用手機開啟連結 可以累積潛水並贈送抵用金");
  lines.push(`${baseUrl}/d`);
  if (inRange.length === 0) {
    lines.push("🌊 日潛場次");
    lines.push("（目前尚無場次）");
  } else {
    const dts = inRange.map((t) => new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`)).sort((a, b) => a.getTime() - b.getTime());
    const first = dts[0], last = dts[dts.length - 1];
    lines.push(`🌊 日潛場次 ${fmtMD(first)}(週${weekdayMap[first.getDay()]}) ~ ${fmtMD(last)}(週${weekdayMap[last.getDay()]})`);
    for (const t of inRange) {
      const d = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
      const wd = weekdayMap[d.getDay()];
      const sitesStr = t.diveSiteIds.map(siteName).join("·") || "未設潛點";
      const moon = t.isNightDive ? "🌙" : "";
      lines.push(`${fmtMD(d)}(週${wd}) ${t.startTime} ${moon}${sitesStr} ${t.tankCount} 支`);
    }
    noteLines().forEach((l) => lines.push(l));
  }
  const toursInRange = o.tours.filter((t) => {
    if (t.status === "cancelled") return false;
    const sd = new Date(`${t.dateStart.slice(0, 10)}T00:00:00+08:00`);
    return sd >= start && sd <= end;
  }).sort((a, b) => (a.dateStart.slice(0, 10) < b.dateStart.slice(0, 10) ? -1 : 1));
  if (toursInRange.length > 0) {
    lines.push(HR);
    lines.push("⛴️ 國內外潛水旅行團 歡迎報名參加");
    for (const t of toursInRange) {
      const range = t.dateStart.slice(0, 10) === t.dateEnd.slice(0, 10) ? fmtMDs(t.dateStart) : `${fmtMDs(t.dateStart)}–${fmtMDs(t.dateEnd)}`;
      const dur = t.durationLabel ? `（${t.durationLabel}）` : "";
      lines.push(`${range} ${t.title}${dur}`);
    }
  }
  const DEFAULT_FOOTER = [
    "🔗 如果有潛水任何問題可以透過以下方式汪汪聯繫",
    `站內訊息  ${liffAppUrl("/messages")}`,
    `LINE  ${SUPPORT_LINE}`,
    `會員優惠 ${baseUrl}/rewards`,
    `常見問題 ${baseUrl}/faq`,
    `費用價目 ${baseUrl}/pricing`,
  ].join("\n");
  if (footer.enabled) {
    const footerLines = (footer.text.trim() || DEFAULT_FOOTER).split("\n").map((s) => s.trimEnd()).filter((s) => s !== "");
    if (footerLines.length) { lines.push(HR); lines.push(...footerLines); }
  }
  return lines.join("\n");
}
