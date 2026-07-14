import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { LINE_BOOK_URL, LineIcon } from "../_home/data";
import { SeoShell, Card } from "../_seo/SeoShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 即時讀後台真實場次

export const metadata: Metadata = {
  title: "本月可約場次 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水本月可預約場次一覽：日潛、體驗潛水、Fun Dive、潛旅，含剩餘名額。汪汪教練帶你安心下水，加 LINE 直接預約。",
  alternates: { canonical: "/schedule" },
};

const WD = ["日", "一", "二", "三", "四", "五", "六"];
const md = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
const wd = (d: Date) => WD[d.getUTCDay()];
// v637：手機會員登入/預約 LIFF（提醒用手機登入預約）
const LIFF_BOOK_URL = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";

export default async function SchedulePage() {
  // 台北「今天」→ 本月底
  const now = new Date();
  const todayStr = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const [y, m] = todayStr.split("-").map(Number);
  const lastStr = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const todayD = new Date(todayStr);
  const lastD = new Date(lastStr);

  const trips = await prisma.divingTrip
    .findMany({
      where: { status: { in: ["open", "full"] }, date: { gte: todayD, lte: lastD } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })
    .catch(() => []);

  const tripIds = trips.map((t) => t.id);
  const [bookings, sites, tours] = await Promise.all([
    tripIds.length
      ? prisma.booking.groupBy({ by: ["refId"], where: { refId: { in: tripIds }, type: "daily", status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"] } }, _sum: { participants: true } }).catch(() => [])
      : Promise.resolve([]),
    prisma.diveSite.findMany({ where: { id: { in: Array.from(new Set(trips.flatMap((t) => t.diveSiteIds))) } } }).catch(() => []),
    // v635：潛旅多為未來月份開團，不綁「本月」，顯示所有尚未結束的開放團
    prisma.tourPackage.findMany({ where: { status: { in: ["open", "full"] }, dateEnd: { gte: todayD } }, orderBy: { dateStart: "asc" } }).catch(() => []),
  ]);
  const bookedMap = new Map(bookings.map((b) => [b.refId, b._sum.participants ?? 0]));
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  const tourIds = tours.map((t) => t.id);
  const tourBookings = tourIds.length
    ? await prisma.booking.groupBy({ by: ["refId"], where: { refId: { in: tourIds }, type: "tour", status: { not: "cancelled_by_user" } }, _sum: { participants: true } }).catch(() => [])
    : [];
  const tourBookedMap = new Map(tourBookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  const availLabel = (capacity: number | null, booked: number) =>
    capacity == null ? { t: "可約", ok: true } : capacity - booked > 0 ? { t: `餘 ${capacity - booked}`, ok: true } : { t: "額滿", ok: false };

  const empty = trips.length === 0 && tours.length === 0;

  return (
    <SeoShell
      eyebrow="This Month"
      title="本月可約場次"
      subtitle="即時顯示後台最新場次與剩餘名額。看到想去的日子，直接點「LINE 預約」告訴汪汪即可——單人報名也 OK，現場幫你找潛伴。"
      current="/schedule"
    >
      {empty ? (
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0A2342", marginBottom: 8 }}>本月場次陸續更新中 🐬</div>
          <p style={{ color: "#5a6b7d", fontSize: 14.5, lineHeight: 1.8, margin: "0 0 16px" }}>還沒看到適合的日子？加 LINE 告訴汪汪你想潛的日期與人數，幫你客製安排。</p>
          <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={ctaStyle}><LineIcon s={18} />LINE 詢問 / 客製行程</a>
        </Card>
      ) : (
        <>
          {/* v637：預約方式提醒；v847：暫停桌機下單 → 移除電腦版入口，一律引導手機/LINE */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#eafaf3", border: "1px solid #bfe9d4", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, lineHeight: 1.7, color: "#0a5c3e" }}>
              <b>線上預約方式</b>：📱 請用手機以 LINE 登入會員預約；也可加 LINE 由小編協助安排。
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={LIFF_BOOK_URL} target="_blank" rel="noopener" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "10px 18px", borderRadius: 999 }}>
                <LineIcon s={16} />手機登入預約
              </a>
            </div>
          </div>
          {/* v636：左右兩欄 —— 左日潛 / 右潛旅；窄螢幕(手機)自動堆疊成單欄 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, alignItems: "start" }}>
            {/* 左：日潛 */}
            <section>
              <h2 style={hStyle}>🔱 日潛 Fun Dive　<span style={{ fontSize: 12.5, fontWeight: 700, color: "#9aabae" }}>本月場次</span></h2>
              {trips.length > 0 ? (
                trips.map((t) => {
                  const booked = bookedMap.get(t.id) ?? 0;
                  const a = availLabel(t.capacity, booked);
                  const type = t.isNightDive ? "夜潛" : t.isScooter ? "水推 DPV" : "日潛";
                  const site = t.diveSiteIds.map((id) => siteMap.get(id) ?? id)[0] ?? "東北角";
                  return <Row key={t.id} date={md(t.date)} wd={wd(t.date)} title={`${site}・${type}`} meta={`${t.startTime}　${t.tankCount} 潛`} avail={a} />;
                })
              ) : (
                <EmptyCol text="本月日潛場次更新中，加 LINE 告訴汪汪想潛的日期。" />
              )}
            </section>
            {/* 右：潛旅 */}
            <section>
              <h2 style={hStyle}>⛴️ 潛旅 Dive Trip　<span style={{ fontSize: 12.5, fontWeight: 700, color: "#9aabae" }}>近期開團</span></h2>
              {tours.length > 0 ? (
                tours.map((t) => {
                  const a = availLabel(t.capacity, tourBookedMap.get(t.id) ?? 0);
                  const range = +t.dateStart === +t.dateEnd ? md(t.dateStart) : `${md(t.dateStart)}–${md(t.dateEnd)}`;
                  return <Row key={t.id} date={range} wd={wd(t.dateStart)} title={t.title} meta={t.durationLabel ?? ""} avail={a} />;
                })
              ) : (
                <EmptyCol text="近期潛旅規劃中，加 LINE 搶先收到開團通知。" />
              )}
            </section>
          </div>
          <p style={{ textAlign: "center", color: "#9aabae", fontSize: 12.5, marginTop: 18 }}>名額為即時資料，實際以 LINE 確認為準。</p>
        </>
      )}
    </SeoShell>
  );
}

const hStyle: React.CSSProperties = { fontSize: 18, fontWeight: 900, color: "#0A2342", margin: "4px 0 12px" };
const ctaStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "#06c755", color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "11px 22px", borderRadius: 999 };

function EmptyCol({ text }: { text: string }) {
  return (
    <Card style={{ textAlign: "center", color: "#7c9296", fontSize: 13.5, lineHeight: 1.8 }}>
      {text}
    </Card>
  );
}

function Row({ date, wd, title, meta, avail }: { date: string; wd: string; title: string; meta: string; avail: { t: string; ok: boolean } }) {
  return (
    <Card style={{ marginBottom: 10, opacity: avail.ok ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 52 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0A2342", lineHeight: 1 }}>{date}</div>
          <div style={{ fontSize: 11, color: "#9aabae" }}>（{wd}）</div>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#1A2330" }}>{title}</div>
          {meta ? <div style={{ fontSize: 12.5, color: "#7c9296" }}>{meta}</div> : null}
        </div>
        {/* v637：移除每列的 LINE 按鈕，改由上方「手機登入預約」提醒統一導引；此處只留名額標 */}
        <span style={{ flexShrink: 0, background: avail.ok ? "#e3f6ec" : "#f1eef0", color: avail.ok ? "#0a7d4f" : "#9b8a92", fontWeight: 800, fontSize: 12.5, padding: "4px 11px", borderRadius: 999 }}>{avail.t}</span>
      </div>
    </Card>
  );
}
