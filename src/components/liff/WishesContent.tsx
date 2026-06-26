"use client";
// v697：預約潛水(願望單)內容(抽自 /liff/wishes/new),供「潛水預約」整合頁即時切換。送出成功改顯示 inline 成功狀態,不跳出。
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLiff } from "@/lib/liff/LiffProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface DiveSite { id: string; name: string; region: string | null }
const TYPE_OPTIONS = [
  { value: "boat", label: "🚤 船潛", desc: "搭船到外海定點下水" },
  { value: "shore", label: "🏖 岸潛", desc: "從岸邊下水" },
  { value: "night", label: "🌙 夜潛", desc: "傍晚日落後下水" },
  { value: "tour", label: "✈️ 潛水團", desc: "跨日旅遊（綠島、墾丁、國外...）" },
] as const;
type WishType = (typeof TYPE_OPTIONS)[number]["value"];

export function WishesContent() {
  const liff = useLiff();
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [type, setType] = useState<WishType>("boat");
  const [preferredDate, setPreferredDate] = useState<string>("");
  const [altDates, setAltDates] = useState<string[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [otherSites, setOtherSites] = useState<string>("");
  const [participants, setParticipants] = useState(1);
  const [note, setNote] = useState("");
  const [refLinks, setRefLinks] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/dive-sites").then((r) => r.json()).then((d) => setSites(d.sites ?? [])).catch(() => {});
  }, []);

  const isValid = preferredDate && (selectedSiteIds.length > 0 || otherSites.trim().length > 0) && participants >= 1;

  async function submit() {
    if (!isValid) return;
    setSubmitting(true); setErr(null);
    try {
      const cleanLinks = refLinks.filter((l) => l.trim());
      const referenceImages = cleanLinks.map((url) => ({ url: url.trim(), type: "link" as const }));
      await liff.fetchWithAuth<{ wish: { id: string } }>("/api/dive-wishes", {
        method: "POST",
        body: JSON.stringify({
          type, preferredDate, alternativeDates: altDates, diveSiteIds: selectedSiteIds,
          otherSites: otherSites.trim() || null, participants, budgetPerPerson: null,
          customerNote: note || null, referenceImages,
        }),
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div className="px-4 pt-10 pb-28 text-center">
        <div className="text-5xl">✅</div>
        <div className="mt-3 text-lg font-bold text-[var(--color-ocean-deep)]">願望單已送出！</div>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] leading-relaxed">老闆會在 24-48 小時內 LINE 回覆討論。<br />達成共識後會開出正式場次給你預約。</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/liff/my"><Button variant="ocean" size="lg" className="w-full">看我的預約 / 願望單</Button></Link>
          <Button variant="outline" size="lg" className="w-full" onClick={() => { setDone(false); setPreferredDate(""); setAltDates([]); setSelectedSiteIds([]); setOtherSites(""); setParticipants(1); setNote(""); setRefLinks([""]); }}>再提一筆</Button>
        </div>
      </div>
    );
  }

  const groupedSites = sites.reduce<Record<string, DiveSite[]>>((acc, s) => {
    const region = s.region ?? "其他";
    if (!acc[region]) acc[region] = [];
    acc[region].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4 px-4 pt-4 pb-28">
      <div className="rounded-lg bg-[var(--color-phosphor)]/10 p-3 text-xs text-[var(--color-ocean-deep)]">
        🌊 找不到喜歡的場次嗎？提出您理想的潛水組合，老闆會回覆討論。<br />達成共識後會開出正式場次給您預約。
      </div>

      <Card><CardContent className="p-4">
        <Label className="text-sm font-semibold mb-2 block"><span className="text-rose-600">＊</span>潛水方式</Label>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setType(opt.value)}
              className={`rounded-md border-2 p-2 text-left ${type === opt.value ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10" : "border-[var(--border)]"}`}>
              <div className="text-sm font-semibold">{opt.label}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">{opt.desc}</div>
            </button>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div>
          <Label htmlFor="pd" className="text-sm font-semibold"><span className="text-rose-600">＊</span>第一順位日期</Label>
          <Input id="pd" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-sm font-semibold">備選日期（選填，可多個）</Label>
          {altDates.map((d, i) => (
            <div key={i} className="mt-1 flex gap-1">
              <Input type="date" value={d} onChange={(e) => setAltDates((arr) => arr.map((x, idx) => idx === i ? e.target.value : x))} />
              <Button size="sm" variant="outline" onClick={() => setAltDates((arr) => arr.filter((_, idx) => idx !== i))}>✕</Button>
            </div>
          ))}
          {altDates.length < 5 && <Button size="sm" variant="outline" className="mt-1" onClick={() => setAltDates((arr) => [...arr, ""])}>＋ 加備選日期</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <Label className="text-sm font-semibold mb-2 block"><span className="text-rose-600">＊</span>想潛潛點（多選）</Label>
        {Object.entries(groupedSites).map(([region, regionSites]) => (
          <div key={region} className="mb-3">
            <div className="text-[10px] text-[var(--muted-foreground)] mb-1">{region}</div>
            <div className="flex flex-wrap gap-1.5">
              {regionSites.map((s) => (
                <label key={s.id} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${selectedSiteIds.includes(s.id) ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10" : "border-[var(--border)]"}`}>
                  <input type="checkbox" checked={selectedSiteIds.includes(s.id)}
                    onChange={(e) => setSelectedSiteIds((arr) => e.target.checked ? [...arr, s.id] : arr.filter((x) => x !== s.id))} className="hidden" />
                  {selectedSiteIds.includes(s.id) ? "✓" : "○"} {s.name}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2">
          <Label className="text-xs text-[var(--muted-foreground)]">其他潛點（自填，例：綠島、墾丁、菲律賓）</Label>
          <Input value={otherSites} onChange={(e) => setOtherSites(e.target.value)} placeholder="未在上方清單中的潛點" maxLength={500} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <Label className="text-sm font-semibold"><span className="text-rose-600">＊</span>預計人數</Label>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setParticipants(Math.max(1, participants - 1))}>－</Button>
          <span className="w-12 text-center font-bold">{participants}</span>
          <Button size="sm" variant="outline" onClick={() => setParticipants(Math.min(20, participants + 1))}>＋</Button>
          <span className="ml-1 text-xs text-[var(--muted-foreground)]">人</span>
        </div>
        <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">💬 報價由老闆依您需求回覆，不需自填預算</p>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <Label className="text-sm font-semibold">補充說明（選填）</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} placeholder="想看什麼魚、出發時段、裝備需求、團員資訊..." rows={4}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
        <div className="mt-1 text-[10px] text-right text-[var(--muted-foreground)]">{note.length} / 2000</div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <Label className="text-sm font-semibold">參考連結（選填）</Label>
        <p className="text-[10px] text-[var(--muted-foreground)] mb-2">放潛點介紹、想去的行程連結、IG/FB 圖片連結等</p>
        {refLinks.map((link, i) => (
          <div key={i} className="mt-1 flex gap-1">
            <Input type="url" value={link} onChange={(e) => setRefLinks((arr) => arr.map((x, idx) => idx === i ? e.target.value : x))} placeholder="https://..." />
            {refLinks.length > 1 && <Button size="sm" variant="outline" onClick={() => setRefLinks((arr) => arr.filter((_, idx) => idx !== i))}>✕</Button>}
          </div>
        ))}
        {refLinks.length < 5 && <Button size="sm" variant="outline" className="mt-1" onClick={() => setRefLinks((arr) => [...arr, ""])}>＋ 加連結</Button>}
      </CardContent></Card>

      {err && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      <Button variant="ocean" size="lg" className="w-full" disabled={!isValid || submitting} onClick={submit}>
        {submitting ? "送出中..." : "📤 提出願望單"}
      </Button>
      <p className="text-[10px] text-center text-[var(--muted-foreground)]">老闆會在 24-48 小時內 LINE 回覆。每週最多可提出 10 個願望單。</p>
    </div>
  );
}
