"use client";
// 手機簡版後台「今明場次」（/admin/m/trips）
//   只載今明兩天日潛場次（輕量 /api/admin/m/trips），依今天/明天分組。
//   每場一列：時間・潛點・X 人・教練；點列展開客戶姓名清單（預設收合）。
//   複雜編輯引導回 /admin/trips。
import { useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import { ChevronDown, ChevronRight, Users, MapPin } from "lucide-react";
import { PAY_LABEL } from "@/lib/payment-methods"; // v1019：付款方式中文

const URL = "/api/admin/m/trips";

// v1017：參與者帶暱稱 + 該筆訂單內容（點名字開視窗）
interface MParticipant {
  name: string;
  nickname: string | null;
  bookingId: string;
  bookingCode: string | null;
  ordererName: string;
  ordererNick: string | null;
  phone: string | null;
  people: number;
  tankCount: number | null;
  notes: string | null;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string | null; // v1019
  status: string;
}
interface MTrip {
  id: string;
  date: string;
  startTime: string;
  sites: string[];
  people: number;
  coachName: string | null;
  participants: MParticipant[];
  // v1023：手機端編輯用
  capacity: number | null;
  coachIds: string[];
  status: string;
  notes: string | null;
  tankCount: number;
}
interface Coach { id: string; realName: string }
interface Resp {
  today: string;
  tomorrow: string;
  trips: MTrip[];
}

export default function MobileTripsPage() {
  const { ready } = useAdminAuth();
  const [data, setData] = useState<Resp | undefined>(() => getCached<Resp>(URL));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openP, setOpenP] = useState<MParticipant | null>(null); // v1017：訂單內容彈窗
  // v1023：場次操作（⋯ 選單 / 編輯 / 刪除）
  const [actTrip, setActTrip] = useState<MTrip | null>(null);
  const [editTrip, setEditTrip] = useState<MTrip | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: "", startTime: "", capacity: "", coachIds: [] as string[], status: "open", notes: "" });

  function openEdit(t: MTrip) {
    setActTrip(null);
    setForm({
      date: t.date, startTime: t.startTime,
      capacity: t.capacity == null ? "" : String(t.capacity),
      coachIds: t.coachIds ?? [], status: t.status || "open", notes: t.notes ?? "",
    });
    setEditTrip(t);
    if (coaches.length === 0) {
      adminFetch<{ coaches: Coach[] }>("/api/admin/coaches").then((r) => setCoaches(r.coaches ?? [])).catch(() => {});
    }
  }

  async function saveEdit() {
    if (!editTrip || busy) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/trips/${editTrip.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: form.date,
          startTime: form.startTime,
          capacity: form.capacity.trim() === "" ? null : Number(form.capacity),
          coachIds: form.coachIds,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      setEditTrip(null);
      reload();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      alert(/trip_past_date_locked|日期已鎖定/.test(m)
        ? "此場次日期已過或已有訂單，日期不可更改。\n若要開新的一天，請用「＋ 新增場次」。"
        : "儲存失敗：" + m);
    } finally { setBusy(false); }
  }

  async function removeTrip(t: MTrip) {
    if (t.people > 0) {
      alert(`此場次已有 ${t.people} 人報名，無法刪除。\n請先取消訂單，或改用「關閉報名」。`);
      return;
    }
    if (!confirm(`確定刪除 ${t.date} ${t.startTime}\n${t.sites.join("、") || "未設潛點"}？\n\n刪除後無法復原。`)) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/trips/${t.id}?permanent=true`, { method: "DELETE" });
      setActTrip(null);
      reload();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      alert(/active bookings/.test(m) ? "此場次仍有有效訂單，請先取消訂單再刪除。" : "刪除失敗：" + m);
    } finally { setBusy(false); }
  }

  async function toggleStatus(t: MTrip) {
    const next = t.status === "open" ? "full" : "open";
    if (!confirm(next === "full" ? "關閉報名？（客戶將無法再預約，資料保留）" : "重新開放報名？")) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/trips/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setActTrip(null);
      reload();
    } catch (e) {
      alert("狀態更新失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  // v1023：抽出可重用的重新載入（編輯/刪除後刷新列表）
  function reload() {
    cachedFetch<Resp>(URL, { force: true })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"));
  }

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(data === undefined);
    cachedFetch<Resp>(URL, { force: true })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // v1002：改列「今天起所有」場次 —— 依日期分組（今天/明天/其餘顯示 M/D（週X））
  const groups: Array<{ label: string; key: string; trips: MTrip[] }> = data
    ? (() => {
        const wd = ["日", "一", "二", "三", "四", "五", "六"];
        const byDate = new Map<string, MTrip[]>();
        for (const t of data.trips) {
          const arr = byDate.get(t.date) ?? [];
          arr.push(t);
          byDate.set(t.date, arr);
        }
        return Array.from(byDate.keys()).sort().map((key) => {
          const label = key === data.today ? "今天" : key === data.tomorrow ? "明天" : (() => {
            const d = new Date(`${key}T00:00:00+08:00`);
            return `${d.getMonth() + 1}/${d.getDate()}（週${wd[d.getDay()]}）`;
          })();
          return { label, key, trips: byDate.get(key)! };
        });
      })()
    : [];

  return (
    <MobileAdminShell title="日潛場次" back="/liff/profile">

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-10"><DiverLoader label="載入中…" size={90} /></div>
      )}

      {data && groups.length === 0 && (
        <div className="rounded-xl border px-3 py-6 text-center text-xs" style={{ borderColor: "rgba(0,0,0,0.08)", color: "var(--muted-foreground)" }}>
          目前沒有排定的日潛場次
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-sm font-bold">{g.label}</span>
                <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {g.key}・{g.trips.length} 場
                </span>
              </div>
              {g.trips.length === 0 ? (
                <div
                  className="rounded-xl border px-3 py-4 text-center text-xs"
                  style={{ borderColor: "rgba(0,0,0,0.08)", color: "var(--muted-foreground)" }}
                >
                  無場次
                </div>
              ) : (
                <div className="space-y-2">
                  {g.trips.map((t) => {
                    const isOpen = open.has(t.id);
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border"
                        style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(t.id)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                        >
                          <span className="font-mono text-sm font-bold tabular-nums">{t.startTime}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--color-ocean-deep)" }} />
                              <span className="truncate">{t.sites.join("、") || "—"}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                              <span className="inline-flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                {t.people} 人
                              </span>
                              {t.coachName && <span>教練：{t.coachName}</span>}
                              {/* v1023：非開放狀態標記 */}
                              {t.status !== "open" && (
                                <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold" style={{ background: "#ffe8e3", color: "#b3462c" }}>
                                  {t.status === "full" ? "已關閉報名" : t.status === "cancelled" ? "已取消" : t.status}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* v1023：場次操作選單 */}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setActTrip(t); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setActTrip(t); } }}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
                            style={{ color: "var(--muted-foreground)" }}
                            aria-label="場次操作"
                          >
                            ⋯
                          </span>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                          ) : (
                            <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                          )}
                        </button>
                        {isOpen && (
                          <div
                            className="border-t px-3 py-2"
                            style={{ borderColor: "rgba(0,0,0,0.06)" }}
                          >
                            {t.participants.length === 0 ? (
                              <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                                尚無報名
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {/* v1017：暱稱（姓名）；點一下看該筆訂單內容 */}
                                {t.participants.map((p, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setOpenP(p)}
                                    className="rounded-full px-2 py-0.5 text-[11px]"
                                    style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                                  >
                                    <span className="font-extrabold">{p.nickname?.trim() || "?"}</span>
                                    <span>（{p.name}）</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* v1023：場次操作選單 */}
      {actTrip && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setActTrip(null); }}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-6">
            <div className="mb-3">
              <div className="text-[15px] font-bold">{actTrip.date}（{actTrip.startTime}）</div>
              <div className="text-[12px] text-[var(--muted-foreground)]">
                {actTrip.sites.join("、") || "未設潛點"}・{actTrip.people} 人報名
              </div>
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => openEdit(actTrip)}
                className="block w-full rounded-xl border py-3 text-center text-[14px] font-bold" style={{ borderColor: "var(--border)" }}>
                ✏️ 編輯場次
              </button>
              <button type="button" disabled={busy} onClick={() => toggleStatus(actTrip)}
                className="block w-full rounded-xl border py-3 text-center text-[14px] font-bold disabled:opacity-50" style={{ borderColor: "var(--border)" }}>
                {actTrip.status === "open" ? "🚫 關閉報名" : "✅ 重新開放報名"}
              </button>
              <button type="button" disabled={busy} onClick={() => removeTrip(actTrip)}
                className="block w-full rounded-xl border py-3 text-center text-[14px] font-bold disabled:opacity-50"
                style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}>
                🗑️ 刪除場次{actTrip.people > 0 ? "（已有報名，不可刪）" : ""}
              </button>
              <button type="button" onClick={() => setActTrip(null)}
                className="block w-full py-2 text-center text-[13px] text-[var(--muted-foreground)]">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* v1023：編輯場次（手機精簡版：日期/時間/人數上限/教練/狀態/備註） */}
      {editTrip && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setEditTrip(null); }}>
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-bold">編輯場次</span>
              <button type="button" onClick={() => setEditTrip(null)} className="px-1 text-xl leading-none text-[var(--muted-foreground)]">✕</button>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
              {editTrip.sites.join("、") || "未設潛點"}・{editTrip.tankCount} 支/人
              <br />潛點／支數／價格／集合地點請至電腦版修改。
            </p>

            <div className="space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">日期</span>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border px-2 py-2" style={{ borderColor: "var(--border)" }} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">開始時間</span>
                  <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full rounded-lg border px-2 py-2" style={{ borderColor: "var(--border)" }} />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">人數上限（留空＝不限）</span>
                <input inputMode="numeric" value={form.capacity} placeholder="例：8"
                  onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, "") })}
                  className="w-full rounded-lg border px-2 py-2" style={{ borderColor: "var(--border)" }} />
              </label>

              <div>
                <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">教練（可複選）</span>
                <div className="flex flex-wrap gap-1.5">
                  {coaches.length === 0 && <span className="text-[11.5px] text-[var(--muted-foreground)]">載入中…</span>}
                  {coaches.map((c) => {
                    const on = form.coachIds.includes(c.id);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setForm({ ...form, coachIds: on ? form.coachIds.filter((x) => x !== c.id) : [...form.coachIds, c.id] })}
                        className="rounded-lg border px-2.5 py-1.5 text-[12px] font-bold"
                        style={on
                          ? { borderColor: "var(--color-phosphor)", background: "rgba(0,217,203,.15)", color: "var(--color-ocean-deep)" }
                          : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                        {c.realName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">狀態</span>
                <div className="flex gap-1.5">
                  {([["open", "開放報名"], ["full", "關閉報名"]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setForm({ ...form, status: k })}
                      className="flex-1 rounded-lg border py-2 text-[12.5px] font-bold"
                      style={form.status === k
                        ? { borderColor: "var(--color-phosphor)", background: "rgba(0,217,203,.15)", color: "var(--color-ocean-deep)" }
                        : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[var(--muted-foreground)]">場次備註</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  placeholder="例：改集合時間、注意事項…"
                  className="w-full resize-y rounded-lg border px-2 py-2" style={{ borderColor: "var(--border)" }} />
              </label>

              <button type="button" onClick={saveEdit} disabled={busy}
                className="block w-full rounded-xl py-3 text-center text-[14.5px] font-extrabold disabled:opacity-50"
                style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
                {busy ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1022：快速新增場次（複製既有場次 + 多選日期） */}
      {data && (
        <Link
          href="/admin/m/trips/new"
          className="mt-4 block rounded-full py-3 text-center text-[14px] font-extrabold"
          style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", boxShadow: "0 6px 16px rgba(0,217,203,.35)" }}
        >
          ＋ 新增場次
        </Link>
      )}

      {/* v1017：點參與者 → 顯示該筆訂單內容（幾支 / 備註 / 金額 / 電話） */}
      {openP && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setOpenP(null); }}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-6">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-bold">
                  <span className="text-[#7c3aed]">{openP.nickname?.trim() || "?"}</span>
                  <span>（{openP.name}）</span>
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  訂單 {openP.bookingCode ?? openP.bookingId.slice(0, 8)}
                  {openP.name !== openP.ordererName && `・訂購人 ${openP.ordererNick?.trim() || "?"}（${openP.ordererName}）`}
                </div>
              </div>
              <button type="button" onClick={() => setOpenP(null)} className="px-1 text-xl leading-none text-[var(--muted-foreground)]">✕</button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="rounded-lg bg-[var(--color-phosphor)]/15 px-3 py-2 font-bold text-[var(--color-ocean-deep)]">
                🤿 潛水 {openP.tankCount ?? "—"} 支/人
                {openP.people > 1 && `・共 ${openP.people} 人（${(openP.tankCount ?? 0) * openP.people} 支）`}
              </div>

              <div>
                <div className="mb-1 text-[11px] font-bold text-[var(--muted-foreground)]">📝 備註</div>
                <div className="whitespace-pre-wrap rounded-lg border px-3 py-2 text-[13px] leading-relaxed" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  {openP.notes?.trim() || "（無備註）"}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <span className="text-[var(--muted-foreground)]">金額</span>
                <span className="font-mono font-bold tabular-nums">
                  已付 {openP.paidAmount.toLocaleString()} / {openP.totalAmount.toLocaleString()}
                  {openP.totalAmount > openP.paidAmount && (
                    <span className="ml-1 text-[var(--color-coral)]">未收 {(openP.totalAmount - openP.paidAmount).toLocaleString()}</span>
                  )}
                </span>
              </div>

              {/* v1019：客戶選的付款方式 */}
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <span className="text-[var(--muted-foreground)]">付款方式</span>
                <span className="font-bold">
                  {openP.paymentMethod && PAY_LABEL[openP.paymentMethod as keyof typeof PAY_LABEL]
                    ? PAY_LABEL[openP.paymentMethod as keyof typeof PAY_LABEL]
                    : "—"}
                </span>
              </div>

              {openP.phone && (
                <a href={`tel:${openP.phone}`} className="block rounded-lg bg-[var(--color-ocean-deep)] py-2.5 text-center font-bold text-white">
                  📞 打給 {openP.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </MobileAdminShell>
  );
}
