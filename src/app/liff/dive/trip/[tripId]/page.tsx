"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Anchor,
  Moon,
  AlertTriangle,
  Check,
  Plus,
  X,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface TripDetail {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number;
  booked: number;
  available: number;
  pricing: {
    baseTrip: number;
    extraTank: number;
    nightDive: number;
    scooterRental: number;
  };
  sites: Array<{ id: string; name: string; description: string }>;
  coaches: Array<{ id: string; realName: string; cert: string }>;
}

type GearItemType =
  | "BCD"
  | "regulator"
  | "wetsuit"
  | "fins"
  | "mask"
  | "computer"
  | "full_set";

const GEAR_OPTIONS: Array<{
  itemType: GearItemType;
  label: string;
  price: number;
}> = [
  { itemType: "BCD", label: "BCD", price: 200 },
  { itemType: "regulator", label: "調節器", price: 200 },
  { itemType: "wetsuit", label: "防寒衣", price: 300 },
  { itemType: "fins", label: "蛙鞋", price: 100 },
  { itemType: "mask", label: "面鏡", price: 100 },
  { itemType: "computer", label: "潛水電腦錶", price: 300 },
  { itemType: "full_set", label: "整套 (七折)", price: 800 },
];

const CERTS = ["OW", "AOW", "Rescue", "DM", "Instructor"] as const;

interface Companion {
  id?: string;
  name: string;
  phone: string;
  cert: (typeof CERTS)[number] | null;
  certNumber: string;
  logCount: number;
  relationship: string;
}

function emptyCompanion(): Companion {
  return {
    name: "",
    phone: "",
    cert: null,
    certNumber: "",
    logCount: 0,
    relationship: "",
  };
}

export default function TripBookingPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const router = useRouter();
  const liff = useLiff();
  const [trip, setTrip] = useState<TripDetail | null>(null);

  // form state
  const [participants, setParticipants] = useState(1);
  const [tankCount, setTankCount] = useState(1);
  // 每件裝備的數量；0 = 未選
  const [gearQty, setGearQty] = useState<Record<string, number>>({});
  const [gearOpen, setGearOpen] = useState(false);
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [cert, setCert] = useState<(typeof CERTS)[number] | "">("");
  const [logCount, setLogCount] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");
  const [notes, setNotes] = useState("");

  // 同伴
  const [savedCompanions, setSavedCompanions] = useState<Companion[]>([]);
  // 第 2..N 位參加者的 slot（slot 0 = 同伴#2、slot 1 = 同伴#3）
  const [companionSlots, setCompanionSlots] = useState<Companion[]>([]);

  // cancellation ritual
  const [policyRead, setPolicyRead] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  // 折疊狀態：個人資料、緊急聯絡人預設折疊；缺資料時自動展開
  const [personalOpen, setPersonalOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    liff
      .fetchWithAuth<TripDetail>(`/api/trips/${tripId}`)
      .then((t) => {
        setTrip(t);
        setTankCount(t.tankCount); // 預設用場次的最大潛次
      })
      .catch((e) => setError(e.message));
  }, [tripId, liff]);

  // 載入本人資料 + 同伴清單，第一次預約後再進來會自動帶入
  const [meLoaded, setMeLoaded] = useState(false);
  useEffect(() => {
    liff
      .fetchWithAuth<{
        realName: string | null;
        phone: string | null;
        cert: typeof CERTS[number] | null;
        certNumber: string | null;
        logCount: number;
        emergencyContact: {
          name: string;
          phone: string;
          relationship: string;
        } | null;
        companions: Companion[];
      }>("/api/me")
      .then((me) => {
        if (me.realName) setRealName(me.realName);
        if (me.phone) setPhone(me.phone);
        if (me.cert) setCert(me.cert);
        if (me.logCount) setLogCount(String(me.logCount));
        if (me.emergencyContact) {
          setEmergencyName(me.emergencyContact.name);
          setEmergencyPhone(me.emergencyContact.phone);
          setEmergencyRel(me.emergencyContact.relationship);
        }
        setSavedCompanions(me.companions ?? []);
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
  }, [liff]);

  // 必填欄位是否齊全（給折疊摘要 + 提交檢查用）
  const personalComplete =
    realName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    cert !== "";
  const emergencyComplete =
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 8 &&
    emergencyRel.trim().length >= 1;

  // 缺資料時自動展開：等 /api/me 載完後檢查一次
  const [autoExpanded, setAutoExpanded] = useState(false);
  useEffect(() => {
    if (!meLoaded || autoExpanded) return;
    if (!personalComplete) setPersonalOpen(true);
    if (!emergencyComplete) setEmergencyOpen(true);
    setAutoExpanded(true);
  }, [meLoaded, personalComplete, emergencyComplete, autoExpanded]);

  // 人數變動時調整同伴 slot 數量
  useEffect(() => {
    setCompanionSlots((prev) => {
      const want = Math.max(0, participants - 1);
      if (prev.length === want) return prev;
      const next = prev.slice(0, want);
      while (next.length < want) {
        next.push(emptyCompanion());
      }
      return next;
    });
  }, [participants]);

  const weekday = trip
    ? ["日", "一", "二", "三", "四", "五", "六"][new Date(trip.date).getDay()]
    : "";

  const selectedGearList = useMemo(
    () =>
      GEAR_OPTIONS.map((g) => ({ ...g, qty: gearQty[g.itemType] ?? 0 })).filter(
        (g) => g.qty > 0,
      ),
    [gearQty],
  );
  const gearTotal = useMemo(
    () => selectedGearList.reduce((s, g) => s + g.price * g.qty, 0),
    [selectedGearList],
  );

  const base = useMemo(() => {
    if (!trip) return 0;
    let amt =
      trip.pricing.baseTrip + (tankCount - 1) * trip.pricing.extraTank;
    if (trip.isNightDive) amt += trip.pricing.nightDive;
    if (trip.isScooter) amt += trip.pricing.scooterRental;
    return amt;
  }, [trip, tankCount]);

  // 新規則：場次 × 人數 + 裝備 (各自獨立數量)
  const total = base * participants + gearTotal;

  const companionsValid = companionSlots.every(
    (c) => c.name.trim().length >= 2 && c.cert !== null,
  );

  const canSubmit =
    trip &&
    !submitting &&
    policyRead &&
    signed &&
    signatureName.trim().length >= 2 &&
    realName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 8 &&
    cert !== "" &&
    companionsValid;

  async function submit() {
    if (!trip || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const participantDetails = [
        {
          name: realName,
          phone,
          cert: cert || null,
          certNumber: "",
          logCount: logCount ? Number(logCount) : 0,
          relationship: "",
          isSelf: true,
        },
        ...companionSlots.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          cert: c.cert,
          certNumber: c.certNumber,
          logCount: c.logCount,
          relationship: c.relationship,
          isSelf: false,
        })),
      ];

      const body = {
        tripId: trip.id,
        participants,
        tankCount,
        rentalGear: selectedGearList.map((g) => ({
          itemType: g.itemType,
          price: g.price,
          qty: g.qty,
        })),
        notes: notes || undefined,
        agreedToTerms: true as const,
        realName,
        phone,
        cert: cert || undefined,
        logCount: logCount ? Number(logCount) : undefined,
        emergencyContact: {
          name: emergencyName,
          phone: emergencyPhone,
          relationship: emergencyRel || "其他",
        },
        participantDetails,
      };
      const res = await liff.fetchWithAuth<{ ok: true; booking: { id: string } }>(
        "/api/bookings/daily",
        { method: "POST", body: JSON.stringify(body) },
      );
      router.push(`/liff/my?just=${res.booking.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!trip) {
    return (
      <LiffShell title="場次預約" backHref="/liff/calendar">
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          {error ? `錯誤：${error}` : "載入中..."}
        </div>
      </LiffShell>
    );
  }

  return (
    <LiffShell
      title="日潛預約"
      backHref="/liff/calendar"
      midnight={trip.isNightDive}
    >
      <div className="space-y-3 px-4 pt-3">
        {/* 場次資訊（緊湊排版，與行事曆預覽卡一致） */}
        <Card className={trip.isNightDive ? "bg-[var(--color-midnight)] text-white" : ""}>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex w-14 flex-col items-center leading-tight">
              <div className="text-xl font-bold tabular">
                {trip.date.slice(8)}
              </div>
              <div className={cn("text-[11px] font-semibold", trip.isNightDive ? "text-white" : "text-[var(--color-ocean-deep)]")}>
                週 {weekday}
              </div>
              <div className={cn("text-[10px]", trip.isNightDive ? "opacity-70" : "text-[var(--muted-foreground)]")}>
                {trip.date.slice(5, 7)} 月
              </div>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                <Anchor className="h-3.5 w-3.5 opacity-70" />
                <span>{trip.sites.map((s) => s.name).join(" · ")}</span>
                <Badge variant="muted" className="text-[10px]">
                  {trip.tankCount} 潛
                </Badge>
                {trip.isNightDive && (
                  <Badge variant="ocean" className="gap-0.5 text-[10px]">
                    <Moon className="h-2.5 w-2.5" />夜潛
                  </Badge>
                )}
                {trip.isScooter && (
                  <Badge variant="gold" className="text-[10px]">水推</Badge>
                )}
              </div>
              <div className={cn("mt-1 text-xs tabular", trip.isNightDive ? "opacity-70" : "text-[var(--muted-foreground)]")}>
                {trip.startTime} · 剩 {trip.available}/{trip.capacity}
                {trip.coaches.length > 0 && (
                  <> · 教練 {trip.coaches.map((c) => c.realName).join("、")}</>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 預約內容：人數 + 潛次 + 裝備 (Dialog) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">預約內容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 人數 */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">人數</Label>
              <Stepper
                value={participants}
                min={1}
                max={trip.available}
                onChange={setParticipants}
              />
            </div>
            <Separator />
            {/* 潛次 */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">潛次</Label>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  最多 {trip.tankCount} 潛 · 第二潛起每支 +{trip.pricing.extraTank.toLocaleString()}
                </div>
              </div>
              <Stepper
                value={tankCount}
                min={1}
                max={trip.tankCount}
                onChange={setTankCount}
                suffix="潛"
              />
            </div>
            <Separator />
            {/* 裝備（Dialog 開啟） */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">租賃裝備</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGearOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  {selectedGearList.length > 0 ? "編輯裝備" : "需要租裝備"}
                </Button>
              </div>
              {selectedGearList.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedGearList.map((g) => (
                    <span
                      key={g.itemType}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-phosphor)]/15 px-2 py-0.5 text-xs font-medium"
                    >
                      {g.label}
                      {g.qty > 1 && (
                        <span className="tabular font-bold text-[var(--color-ocean-deep)]">
                          ×{g.qty}
                        </span>
                      )}
                      <span className="tabular text-[var(--muted-foreground)]">
                        +{(g.price * g.qty).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setGearQty((s) => ({ ...s, [g.itemType]: 0 }))
                        }
                        className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  未選 — 自備裝備不需要點
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 個人資料（可折疊） */}
        <CollapsibleCard
          title="個人資料"
          required
          complete={personalComplete}
          open={personalOpen}
          onToggle={() => setPersonalOpen(!personalOpen)}
          summary={
            personalComplete
              ? `${realName}・${phone}・${cert}${logCount ? `・${logCount}支` : ""}`
              : "尚未填寫（必填）"
          }
        >
          <div className="space-y-3">
            {/* 姓名 + 手機 同排 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="realName">姓名 *</Label>
                <Input
                  id="realName"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="本名"
                />
              </div>
              <div>
                <Label htmlFor="phone">手機 *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xx-xxx-xxx"
                />
              </div>
            </div>
            {/* 證照 (下拉) + 累計潛水支數 同排 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cert-select">證照等級 *</Label>
                <select
                  id="cert-select"
                  value={cert}
                  onChange={(e) =>
                    setCert(e.target.value as (typeof CERTS)[number] | "")
                  }
                  className={cn(
                    "mt-0 flex h-11 w-full appearance-none rounded-[var(--radius-card)] border bg-white bg-no-repeat pr-8 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    cert
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 text-[var(--color-ocean-deep)]"
                      : "border-[var(--input)] text-[var(--muted-foreground)]",
                  )}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%230A2342' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                    backgroundPosition: "right 10px center",
                    backgroundSize: "16px 16px",
                    paddingLeft: "12px",
                  }}
                >
                  <option value="">請選擇</option>
                  {CERTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="logs">累計潛水支數</Label>
                <Input
                  id="logs"
                  inputMode="numeric"
                  value={logCount}
                  onChange={(e) =>
                    setLogCount(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="例: 25"
                  className="text-center"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">備註 (教練可見)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="耳壓不適 / 過敏 / 用藥..."
              />
            </div>
          </div>
        </CollapsibleCard>

        {/* 緊急聯絡人（可折疊） */}
        <CollapsibleCard
          title="緊急聯絡人"
          required
          complete={emergencyComplete}
          open={emergencyOpen}
          onToggle={() => setEmergencyOpen(!emergencyOpen)}
          summary={
            emergencyComplete
              ? `${emergencyName}・${emergencyRel}・${emergencyPhone}`
              : "尚未填寫（必填）"
          }
        >
          <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
            <Input
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="姓名 *"
            />
            <Input
              value={emergencyRel}
              onChange={(e) => setEmergencyRel(e.target.value)}
              placeholder="關係 *"
            />
            <Input
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="電話 *"
            />
          </div>
        </CollapsibleCard>

        {/* 同伴清單 (人數 > 1 才出現) */}
        {companionSlots.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                同伴資料 ({companionSlots.length} 位)
              </CardTitle>
              <p className="-mt-1 text-[11px] text-[var(--muted-foreground)]">
                可從已存同伴選擇，或手動輸入。新填的同伴會自動存到您的會員資料。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {companionSlots.map((slot, i) => (
                <CompanionSlotEditor
                  key={i}
                  idx={i + 2}
                  slot={slot}
                  saved={savedCompanions}
                  onChange={(s) =>
                    setCompanionSlots((arr) => {
                      const next = [...arr];
                      next[i] = s;
                      return next;
                    })
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* 取消政策三層簽署 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">取消政策 (請務必閱讀並簽署)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-[var(--muted)] p-3 text-xs leading-relaxed">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--color-coral)]" />
                <div>
                  <p className="font-bold">日潛取消政策</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 opacity-90">
                    <li>潛水前 7 日以前取消：全額退費</li>
                    <li>潛水前 3-6 日取消：扣 30%</li>
                    <li>潛水前 1-2 日取消：扣 50%</li>
                    <li>當日取消 / 未到：全額不退</li>
                    <li>天候因素 (浪高 &gt; 1.5m) 主辦方取消：全額退費或改期</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPolicyRead(!policyRead)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm transition-colors",
                policyRead
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <CheckCircle on={policyRead} />
              <span className="font-medium">我已閱讀並理解取消政策</span>
            </button>

            <button
              type="button"
              disabled={!policyRead}
              onClick={() => setSigned(!signed)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm transition-colors",
                !policyRead && "opacity-40",
                signed
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : policyRead
                  ? "border-dashed border-[var(--border)]"
                  : "border-[var(--border)]",
              )}
            >
              <CheckCircle on={signed} />
              <span className="font-medium">同意，並準備簽署</span>
            </button>

            {signed && (
              <div className="rounded-lg border-2 border-[var(--color-phosphor)] bg-white p-3">
                <Label htmlFor="signature" className="text-xs">
                  請輸入您的姓名作為電子簽署
                </Label>
                <Input
                  id="signature"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="mt-1 font-bold italic"
                  placeholder="（簽名）"
                  style={{
                    fontFamily: '"Brush Script MT", "DFKai-SB", cursive',
                    fontSize: "1.5rem",
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 費用明細 + 送出 */}
        <Card className="sticky bottom-20 z-10 border-2 border-[var(--color-phosphor)]/30">
          <CardContent className="p-4">
            <div className="space-y-1 text-xs tabular text-[var(--muted-foreground)]">
              <div className="flex justify-between">
                <span>
                  場次 ({tankCount}潛{trip.isNightDive ? "·夜" : ""}
                  {trip.isScooter ? "·水推" : ""}) × {participants}人
                </span>
                <span>NT$ {(base * participants).toLocaleString()}</span>
              </div>
              {gearTotal > 0 && (
                <div className="flex justify-between">
                  <span>
                    裝備{" "}
                    {selectedGearList
                      .map((g) => `${g.label}${g.qty > 1 ? `×${g.qty}` : ""}`)
                      .join("、")}
                  </span>
                  <span>+ NT$ {gearTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
            <Separator className="my-2" />
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  總金額 (現場收)
                </div>
                <div className="text-2xl font-bold tabular text-[var(--color-coral)]">
                  NT$ {total.toLocaleString()}
                </div>
              </div>
              <Button
                variant="ocean"
                size="lg"
                disabled={!canSubmit}
                onClick={submit}
              >
                {submitting ? "送出中..." : "確認預約"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg bg-[var(--color-coral)]/15 p-3 text-sm text-[var(--color-coral)]">
            {error}
          </div>
        )}
      </div>

      {/* 裝備選擇 Dialog */}
      <Dialog open={gearOpen} onOpenChange={setGearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>租賃裝備</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-[11px] text-[var(--muted-foreground)]">
            按 + 加數量，例如 2 人想各租 1 件 BCD → BCD 數量 2
          </p>
          <div className="space-y-2">
            {GEAR_OPTIONS.map((g) => {
              const qty = gearQty[g.itemType] ?? 0;
              const active = qty > 0;
              return (
                <div
                  key={g.itemType}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                    active
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                      : "border-[var(--border)]",
                  )}
                >
                  <div className="flex-1">
                    <div className="font-semibold">{g.label}</div>
                    <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                      +{g.price} / 件
                      {active && qty > 0 && (
                        <span className="ml-2 font-bold text-[var(--color-ocean-deep)]">
                          小計 NT$ {(g.price * qty).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={qty <= 0}
                      onClick={() =>
                        setGearQty((s) => ({
                          ...s,
                          [g.itemType]: Math.max(0, (s[g.itemType] ?? 0) - 1),
                        }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-base font-bold tabular">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setGearQty((s) => ({
                          ...s,
                          [g.itemType]: Math.min(20, (s[g.itemType] ?? 0) + 1),
                        }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-phosphor)] bg-[var(--color-phosphor)] font-bold text-[var(--color-ocean-deep)]"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[var(--muted)] p-2 text-xs">
            <span>
              已選 {selectedGearList.length} 項 · 共{" "}
              {selectedGearList.reduce((s, g) => s + g.qty, 0)} 件
            </span>
            <span className="tabular font-bold">
              + NT$ {gearTotal.toLocaleString()}
            </span>
          </div>
          <Button onClick={() => setGearOpen(false)} className="w-full">
            完成
          </Button>
        </DialogContent>
      </Dialog>
    </LiffShell>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <span className="w-10 text-center text-lg font-bold tabular">
        {value}
        {suffix && <span className="ml-0.5 text-xs">{suffix}</span>}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </Button>
    </div>
  );
}

function CheckCircle({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full border-2",
        on
          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]"
          : "border-[var(--muted-foreground)]",
      )}
    >
      {on && <Check className="h-3 w-3 text-[var(--color-ocean-deep)]" />}
    </div>
  );
}

function CompanionSlotEditor({
  idx,
  slot,
  saved,
  onChange,
}: {
  idx: number;
  slot: Companion;
  saved: Companion[];
  onChange: (s: Companion) => void;
}) {
  const complete = slot.name.trim().length >= 2 && slot.cert !== null;
  // 預設：已填齊就折疊，沒填齊就展開
  const [open, setOpen] = useState(!complete);
  // 名單第一次變動時，已填齊就自動收起
  useEffect(() => {
    if (complete) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  function pickSaved(id: string) {
    if (!id) {
      onChange(emptyCompanion());
      return;
    }
    const c = saved.find((x) => x.id === id);
    if (c) onChange({ ...c });
  }

  // 收合狀態：摘要列
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border-2 px-3 py-3 text-left",
          complete
            ? "border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5"
            : "border-dashed border-[var(--color-coral)] bg-[var(--color-coral)]/5",
        )}
      >
        <div className="flex items-center gap-2">
          {complete ? (
            <Check className="h-4 w-4 text-[var(--color-phosphor)]" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-[var(--color-coral)]" />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold">同伴 #{idx}</span>
            <span
              className={cn(
                "text-xs",
                complete
                  ? "text-[var(--foreground)]"
                  : "text-[var(--color-coral)]",
              )}
            >
              {complete
                ? `${slot.name}・${slot.cert}${slot.phone ? `・${slot.phone}` : ""}${slot.relationship ? `・${slot.relationship}` : ""}`
                : "尚未填寫（必填）"}
            </span>
          </div>
        </div>
        <Pencil className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border-2 border-[var(--color-phosphor)]/40 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">同伴 #{idx}</span>
        <div className="flex items-center gap-1.5">
          {saved.length > 0 && (
            <select
              value={slot.id ?? ""}
              onChange={(e) => pickSaved(e.target.value)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium"
            >
              <option value="">— 手動輸入 —</option>
              {saved.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.cert ?? "?"})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-[var(--muted-foreground)] hover:bg-black/5"
            aria-label="收起"
          >
            <ChevronDown className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          value={slot.name}
          onChange={(e) => onChange({ ...slot, name: e.target.value })}
          placeholder="姓名 *"
        />
        <Input
          type="tel"
          value={slot.phone}
          onChange={(e) => onChange({ ...slot, phone: e.target.value })}
          placeholder="手機"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={slot.cert ?? ""}
          onChange={(e) =>
            onChange({
              ...slot,
              cert: (e.target.value || null) as Companion["cert"],
            })
          }
          className={cn(
            "flex h-11 w-full appearance-none rounded-[var(--radius-card)] border bg-white bg-no-repeat pr-8 pl-3 text-sm font-medium",
            slot.cert
              ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 text-[var(--color-ocean-deep)]"
              : "border-[var(--input)] text-[var(--muted-foreground)]",
          )}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%230A2342' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundPosition: "right 10px center",
            backgroundSize: "16px 16px",
          }}
        >
          <option value="">證照 *</option>
          {CERTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Input
          inputMode="numeric"
          value={slot.logCount || ""}
          onChange={(e) =>
            onChange({
              ...slot,
              logCount: Number(e.target.value.replace(/\D/g, "") || 0),
            })
          }
          placeholder="累計潛水支數"
          className="text-center"
        />
      </div>
      <div className="mt-2">
        <Input
          value={slot.relationship}
          onChange={(e) =>
            onChange({ ...slot, relationship: e.target.value })
          }
          placeholder="關係（家人/朋友/配偶...）"
        />
      </div>
    </div>
  );
}

// CollapsibleCard 已搬到 @/components/ui/collapsible-card
