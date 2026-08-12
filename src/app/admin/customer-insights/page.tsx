"use client";
/**
 * v1038：客戶偏好分析
 *
 * 「前台活動」看的是一筆一筆的軌跡；這頁看的是軌跡累積出來的「偏好」——
 * 客戶喜歡哪個潛點、幾點下水、誰在猶豫、誰睡著了。全部由既有資料推導，沒有新增追蹤。
 */
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog";

interface Hesitate { userId: string; name: string; phone: string | null; refType: string; refId: string; label: string; views: number; lastViewedAt: string | null }
interface HotRef { refType: string; refId: string; label: string; watchers: number; views: number; orders: number }
interface SiteRow { id: string; name: string; people: number; orders: number }
interface SlotRow { slot: string; people: number; orders: number; night: boolean }
interface DowRow { dow: string; people: number }
interface Sleep { userId: string; name: string; phone: string | null; lastOrderAt: string | null; totalOrders: number; quietDays: number | null }
interface TopCust { userId: string; name: string; orders: number; people: number; amount: number; favSite: string | null; favSiteCount: number; favSlot: string | null; favSlotCount: number; avgTank: number | null }
// v1060：沉睡門檻分旺淡季
interface Season { peak: boolean; start: string; end: string; manual: boolean }
interface Data {
  season?: Season;
  days: number;
  sleepDays: number;
  summary: { orders: number; people: number; watchers: number; sleeping: number; avgTank: number | null; excludedStaff: number };
  hesitating: Hesitate[];
  hotRefs: HotRef[];
  siteRank: SiteRow[];
  slotRank: SlotRow[];
  dowRank: DowRow[];
  sleeping: Sleep[];
  topCustomers: TopCust[];
}

const RANGES = [30, 90, 180] as const;

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "今天";
  if (d === 1) return "昨天";
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 個月前`;
};

export default function CustomerInsightsPage() {
  const [days, setDays] = useState<number>(90);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  // v1060：null = 依季節自動；有值 = 老闆手動指定門檻天數
  const [sleepOverride, setSleepOverride] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    const qs = `days=${days}${sleepOverride ? `&sleep=${sleepOverride}` : ""}`;
    adminFetch<Data>(`/api/admin/customer-insights?${qs}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [days, sleepOverride]);

  return (
    <AdminShell title="客戶偏好分析">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">統計範圍</span>
          <div className="inline-flex rounded-lg bg-[var(--muted)] p-0.5">
            {RANGES.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === d ? "bg-white text-[var(--color-ocean-deep)] shadow-sm" : "text-[var(--muted-foreground)]"}`}>
                近 {d} 天
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--muted-foreground)]">已排除管理人員（老闆／IT／教練／助教）</span>
        </div>

        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</div>}
        {loading && <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">載入中…</div>}

        {data && !loading && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="成立訂單" value={data.summary.orders} unit="筆" />
              <Stat label="報名人次" value={data.summary.people} unit="人次" accent />
              <Stat label="🔍 猶豫中" value={data.summary.watchers} unit="人次" hint="看過但沒下單" hot={data.summary.watchers > 0} />
              <Stat label="💤 沉睡客戶" value={data.summary.sleeping} unit="位"
                hint={`超過 ${data.sleepDays} 天沒下單${data.season && !data.season.manual ? (data.season.peak ? "（旺季標準）" : "（淡季標準）") : ""}`} />
              <Stat label="平均下水" value={data.summary.avgTank ?? 0} unit="支/人" hint="日潛平均選幾支" />
            </div>

            {/* ── 猶豫清單：最該主動關心的名單 */}
            <Card title="🔍 猶豫清單" desc="看過這個場次卻還沒下單，而且場次還沒出發 —— 一通關心可能就成單。">
              {data.hesitating.length === 0 ? (
                <Empty text="這段期間沒有「看了沒訂」的紀錄。" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b text-[11px] text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                      <tr><th className="py-1.5 pr-3">客戶</th><th className="py-1.5 pr-3">在看什麼</th><th className="py-1.5 pr-3 text-right">看了</th><th className="py-1.5 text-right">最後一次</th></tr>
                    </thead>
                    <tbody>
                      {data.hesitating.map((h) => (
                        <tr key={`${h.userId}-${h.refId}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <button onClick={() => setOpenCustomerId(h.userId)} className="font-medium underline decoration-dotted underline-offset-2 hover:no-underline">{h.name}</button>
                            {h.phone && <span className="ml-1.5 tabular text-[10px] text-[var(--muted-foreground)]">{h.phone}</span>}
                          </td>
                          <td className="py-1.5 pr-3">
                            <span className="mr-1 rounded px-1 py-0.5 text-[9.5px] font-bold" style={{ background: h.refType === "tour" ? "#e8f1ff" : "#e6f6f4", color: h.refType === "tour" ? "#2b5fa8" : "#0a8f86" }}>
                              {h.refType === "tour" ? "潛旅" : "日潛"}
                            </span>
                            {h.label}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular font-bold">{h.views} 次</td>
                          <td className="py-1.5 text-right text-[var(--muted-foreground)]">{ago(h.lastViewedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ── 熱門待轉單 */}
            {data.hotRefs.length > 0 && (
              <Card title="🔥 很多人看、還沒人訂" desc="2 位以上客戶看過的場次。如果看的人多、訂的人少，通常是時間、價格或說明需要調整。">
                <div className="space-y-1.5">
                  {data.hotRefs.map((r) => (
                    <div key={r.refId} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2" style={{ background: r.orders === 0 ? "#fff7f2" : "var(--muted)" }}>
                      <div className="min-w-0 text-xs">
                        <div className="truncate font-medium">{r.label}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">{r.watchers} 人在看 · 共 {r.views} 次瀏覽</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular text-sm font-extrabold" style={{ color: r.orders === 0 ? "#b3562c" : "var(--color-ocean-deep)" }}>{r.orders}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">已成單</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── 潛點排行 */}
              <Card title="🐠 潛點排行" desc="以報名人次計。日潛場次的潛點設定，一場多潛點會各記一次。">
                {data.siteRank.length === 0 ? <Empty text="這段期間沒有日潛訂單。" /> : <Bars rows={data.siteRank.map((s) => ({ label: s.name, value: s.people, sub: `${s.orders} 筆` }))} unit="人次" />}
              </Card>

              {/* ── 時段偏好 */}
              <Card title="🕗 時段偏好" desc="哪個出發時間最受歡迎，決定下次要多開哪一梯。">
                {data.slotRank.length === 0 ? <Empty text="這段期間沒有日潛訂單。" /> : <Bars rows={data.slotRank.map((s) => ({ label: s.slot, value: s.people, sub: `${s.orders} 筆` }))} unit="人次" />}
              </Card>
            </div>

            {/* ── 星期偏好 */}
            <Card title="📅 星期偏好" desc="客戶偏好哪幾天下水（以場次日期計）。">
              <div className="grid grid-cols-7 gap-1.5">
                {data.dowRank.map((d) => {
                  const max = Math.max(1, ...data.dowRank.map((x) => x.people));
                  const pct = Math.round((d.people / max) * 100);
                  return (
                    <div key={d.dow} className="text-center">
                      <div className="flex h-24 items-end justify-center rounded-lg" style={{ background: "var(--muted)" }}>
                        <div className="w-full rounded-lg transition-all" style={{ height: `${Math.max(4, pct)}%`, background: pct === 100 ? "var(--color-ocean-deep)" : "#8fcfc9" }} />
                      </div>
                      <div className="mt-1 text-[11px] font-medium">{d.dow}</div>
                      <div className="tabular text-[10px] text-[var(--muted-foreground)]">{d.people}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ── 常客偏好卡 */}
            {data.topCustomers.length > 0 && (
              <Card title="⭐ 常客偏好卡" desc="這段期間下單最多的客戶，以及他們各自的習慣 —— 開新場次時可以直接點名邀請。">
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.topCustomers.map((c) => (
                    <button key={c.userId} onClick={() => setOpenCustomerId(c.userId)}
                      className="rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold">{c.name}</span>
                        <span className="shrink-0 tabular text-[11px] text-[var(--muted-foreground)]">{c.orders} 筆 / {c.people} 人次</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.favSite && <Chip label={`🐠 ${c.favSite}`} sub={`×${c.favSiteCount}`} />}
                        {c.favSlot && <Chip label={`🕗 ${c.favSlot}`} sub={`×${c.favSlotCount}`} />}
                        {c.avgTank != null && <Chip label={`🫧 平均 ${c.avgTank} 支`} />}
                      </div>
                      <div className="mt-1 tabular text-[10px] text-[var(--muted-foreground)]">累計消費 NT$ {c.amount.toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* ── 沉睡客戶 */}
            <Card
              title="💤 沉睡客戶"
              desc={
                data.season?.manual
                  ? `曾經下過單，但超過 ${data.sleepDays} 天沒有再來。最久沒來的排前面。`
                  : data.season?.peak
                    ? `現在是潛水旺季（清明 ${data.season.start} ～ 中秋 ${data.season.end}），旺季客人本來就常下水，所以門檻抓 ${data.sleepDays} 天 —— 超過就值得關心。最久沒來的排前面。`
                    : `現在是淡季，隔一陣子才來很正常，門檻放寬到 ${data.sleepDays} 天（旺季會自動縮成 21 天）。最久沒來的排前面。`
              }
            >
              {/* v1060：門檻自動跟著季節走，但老闆想用另一套標準看時可以直接切 */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {([
                  { d: 0, label: data.season?.peak ? "自動（旺季 21 天）" : "自動（淡季 90 天）" },
                  { d: 21, label: "旺季標準 21 天" },
                  { d: 90, label: "全年 90 天" },
                ] as const).map(({ d, label }) => {
                  const on = d === 0 ? !sleepOverride : sleepOverride === d;
                  return (
                    <button key={d} type="button" onClick={() => setSleepOverride(d === 0 ? null : d)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? "bg-[var(--color-ocean-deep)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {data.sleeping.length === 0 ? (
                <Empty text="沒有沉睡客戶，大家都還在。" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b text-[11px] text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                      <tr><th className="py-1.5 pr-3">客戶</th><th className="py-1.5 pr-3 text-right">累計訂單</th><th className="py-1.5 pr-3 text-right">最後一單</th><th className="py-1.5 text-right">多久沒來</th></tr>
                    </thead>
                    <tbody>
                      {data.sleeping.map((s) => (
                        <tr key={s.userId} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <button onClick={() => setOpenCustomerId(s.userId)} className="font-medium underline decoration-dotted underline-offset-2 hover:no-underline">{s.name}</button>
                            {s.phone && <span className="ml-1.5 tabular text-[10px] text-[var(--muted-foreground)]">{s.phone}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular">{s.totalOrders}</td>
                          <td className="py-1.5 pr-3 text-right text-[var(--muted-foreground)]">{s.lastOrderAt ? new Date(s.lastOrderAt).toLocaleDateString("zh-TW") : "—"}</td>
                          <td className="py-1.5 text-right tabular font-bold" style={{ color: (s.quietDays ?? 0) >= 180 ? "#b3562c" : undefined }}>{s.quietDays ?? "—"} 天</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {data.summary.excludedStaff > 0 && (
              <p className="pb-4 text-center text-[10.5px] text-[var(--muted-foreground)]">
                以上統計已排除 {data.summary.excludedStaff} 位管理人員；要看逐筆軌跡請到「📊 前台活動」。
              </p>
            )}
          </>
        )}
      </div>

      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />
    </AdminShell>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-sm font-bold">{title}</h2>
      {desc && <p className="mt-0.5 mb-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">{desc}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, unit, hint, accent, hot }: { label: string; value: number; unit: string; hint?: string; accent?: boolean; hot?: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: hot ? "#f0b48c" : "var(--border)", background: hot ? "#fff7f2" : "#fff" }}>
      <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
      <div className="font-mono text-[21px] font-extrabold leading-tight tabular-nums" style={{ color: hot ? "#b3562c" : accent ? "var(--color-ocean-deep)" : undefined }}>
        {value.toLocaleString()}<span className="ml-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">{unit}</span>
      </div>
      {hint && <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div>}
    </div>
  );
}

function Bars({ rows, unit }: { rows: { label: string; value: number; sub?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="truncate pr-2 font-medium">{i === 0 && "🥇 "}{r.label}</span>
            <span className="shrink-0 tabular text-[11px]">
              <b>{r.value}</b> {unit}{r.sub && <span className="ml-1 text-[var(--muted-foreground)]">({r.sub})</span>}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: i === 0 ? "var(--color-ocean-deep)" : "#8fcfc9" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ label, sub }: { label: string; sub?: string }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "var(--muted)" }}>
      {label}{sub && <span className="ml-0.5 tabular text-[var(--muted-foreground)]">{sub}</span>}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-[11.5px] text-[var(--muted-foreground)]">{text}</p>;
}
