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
import { SignaturePad } from "@/components/ui/SignaturePad";
import { PolicyText } from "@/components/ui/PolicyText";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { formatPhoneTW } from "@/lib/phone";
import { cn } from "@/lib/utils";

interface TripDetail {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number | null;     // null = 無上限
  booked: number;
  available: number | null;    // null = 無上限
  pricing: {
    baseTrip: number;
    extraTank: number;
    nightDive: number;
    scooterRental: number;
  };
  sites: Array<{ id: string; name: string; description: string }>;
  referenceVideoUrl?: string | null;
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

interface GearOption { itemType: GearItemType; label: string; price: number; }

const GEAR_OPTIONS_DEFAULT: GearOption[] = [
  { itemType: "BCD", label: "BCD", price: 200 },
  { itemType: "regulator", label: "調節器", price: 200 },
  { itemType: "wetsuit", label: "防寒衣", price: 300 },
  { itemType: "fins", label: "蛙鞋", price: 100 },
  { itemType: "mask", label: "面鏡", price: 100 },
  { itemType: "computer", label: "潛水電腦錶", price: 300 },
  { itemType: "full_set", label: "整套 (七折)", price: 800 },
];

const GEAR_LABELS: Record<GearItemType, string> = {
  BCD: "BCD", regulator: "調節器", wetsuit: "防寒衣",
  fins: "蛙鞋", mask: "面鏡", computer: "潛水電腦錶", full_set: "整套 (七折)",
};

// v211：UI picker 移除 Rescue（既有資料仍可顯示）
const CERTS = ["OW", "AOW", "DM", "Instructor"] as const;

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
  const [gearOptions, setGearOptions] = useState<GearOption[]>(GEAR_OPTIONS_DEFAULT);

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
  // 付款方式：cash 現場 / bank 轉帳 / linepay LINE Pay / other 其他
  // 日潛預設「現場」(當天結算)；客戶可改成轉帳
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "linepay" | "other">("cash");
  // 「其他」付款方式時客戶填寫的說明
  const [paymentNote, setPaymentNote] = useState("");
  // 公開付款資訊（銀行 + LINE Pay），預約頁讀出顯示給客戶
  const [paymentInfo, setPaymentInfo] = useState<{
    bank: { name: string; branch: string; account: string; holder: string };
    linepay: { qrUrl: string; liteId: string };
  } | null>(null);
  // v259：從 /api/config 拉政策內容，給 [查看 ›] modal 顯示用
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [safetyPolicy, setSafetyPolicy] = useState("");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setPaymentInfo({ bank: c.bank, linepay: c.linepay });
        setCancellationPolicy(c.cancellationPolicy ?? "");
        setSafetyPolicy(c.safetyPolicy ?? "");
      })
      .catch(() => {});
  }, []);
  // 抵用金折抵：可用餘額 + 本次折抵
  const [creditBalance, setCreditBalance] = useState(0);
  const [vipLevel, setVipLevel] = useState(1);
  const [creditUsed, setCreditUsed] = useState(0);

  // 同伴
  const [savedCompanions, setSavedCompanions] = useState<Companion[]>([]);
  // 第 2..N 位參加者的 slot（slot 0 = 同伴#2、slot 1 = 同伴#3）
  const [companionSlots, setCompanionSlots] = useState<Companion[]>([]);

  // v259：政策同意流程（兩個 checkbox + 各自 modal）
  // v266：客戶必須先點「查看 ›」進去看過 modal 才能勾選同意
  //   cancellationViewed/safetyViewed = 是否曾經打開過 modal
  //   cancellationRead/safetyRead = 是否勾選同意（modal 關閉時自動勾上）
  const [cancellationViewed, setCancellationViewed] = useState(false);
  const [safetyViewed, setSafetyViewed] = useState(false);
  const [cancellationRead, setCancellationRead] = useState(false);
  const [safetyRead, setSafetyRead] = useState(false);
  const [cancellationModalOpen, setCancellationModalOpen] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  // v260：手寫簽名（取代 v259 之前的「輸入姓名 + 草書字體」）
  //   signatureDataUrl: data:image/png;base64,xxx — 送出 booking 時帶上
  //   signedHasInk: canvas 上至少畫了一筆才算 valid
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signedHasInk, setSignedHasInk] = useState(false);

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

    // 記錄瀏覽（高意願客戶分析用）— fire-and-forget
    void liff.fetchWithAuth("/api/me/page-view", {
      method: "POST",
      body: JSON.stringify({ refType: "trip", refId: tripId }),
    }).catch(() => { /* silent */ });
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, liff.ready]);

  // 從後台讀取裝備租借費率（若有設定則覆蓋預設值）
  useEffect(() => {
    fetch("/api/site-config")
      .then(r => r.json())
      .then((cfg: { gearRentalPrices?: Partial<Record<GearItemType, number>> }) => {
        const prices = cfg.gearRentalPrices ?? {};
        if (Object.keys(prices).length > 0) {
          setGearOptions(
            GEAR_OPTIONS_DEFAULT.map(g => ({
              ...g,
              price: prices[g.itemType] ?? g.price,
              label: GEAR_LABELS[g.itemType],
            }))
          );
        }
      })
      .catch(() => { /* 靜默 fallback 到預設值 */ });
  }, []);

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
        creditBalance: number;
        vipLevel: number;
        emergencyContact: {
          name: string;
          phone: string;
          relationship: string;
        } | null;
        companions: Companion[];
      }>("/api/me")
      .then((me) => {
        if (me.realName) setRealName(me.realName);
        if (me.phone) setPhone(formatPhoneTW(me.phone));
        if (me.cert) setCert(me.cert);
        if (me.logCount) setLogCount(String(me.logCount));
        if (me.emergencyContact) {
          setEmergencyName(me.emergencyContact.name);
          setEmergencyPhone(formatPhoneTW(me.emergencyContact.phone));
          setEmergencyRel(me.emergencyContact.relationship);
        }
        setSavedCompanions(me.companions ?? []);
        setCreditBalance(me.creditBalance ?? 0);
        setVipLevel(me.vipLevel ?? 1);
        // LV1 不可用現場支付 → 預設改成轉帳
        if ((me.vipLevel ?? 1) === 1) {
          setPaymentMethod("bank");
        }
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);

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
      gearOptions.map((g) => ({ ...g, qty: gearQty[g.itemType] ?? 0 })).filter(
        (g) => g.qty > 0,
      ),
    [gearQty],
  );
  const gearTotal = useMemo(
    () => selectedGearList.reduce((s, g) => s + g.price * g.qty, 0),
    [selectedGearList],
  );

  // v48 計價（與 server 一致）：
  //   總額 = baseTrip (整單平收) + extraTank × 支數 × 人數 + 夜潛/水推 + 裝備
  //   baseTrip 是「整單共享」基本費（船費分攤），不 ×人數
  //   extraTank 是「每一次潛水（含空氣瓶）」單價，× 支數 × 人數
  const divesAmount = useMemo(
    () => (trip ? trip.pricing.extraTank * tankCount * participants : 0),
    [trip, tankCount, participants],
  );
  const extraAmount = useMemo(() => {
    if (!trip) return 0;
    // v155：夜潛加價、水上摩托車加價皆已移除（統一價）
    return trip.pricing.baseTrip;
  }, [trip]);
  const total = divesAmount + extraAmount + gearTotal;

  const companionsValid = companionSlots.every(
    (c) => c.name.trim().length >= 2 && c.cert !== null,
  );

  const canSubmit =
    trip &&
    !submitting &&
    cancellationRead &&
    safetyRead &&
    signedHasInk &&
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
        paymentMethod, // 客戶選的付款方式
        paymentNote: paymentMethod === "other" ? paymentNote : undefined,
        creditUsed: Math.min(creditUsed, creditBalance, total),
        agreedToTerms: true as const,
        // v260：手寫簽名 PNG data URL（後端解 base64 → 上 R2）
        signatureDataUrl: signatureDataUrl ?? undefined,
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
        {error ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-coral)]">
            錯誤：{error}
          </div>
        ) : (
          <LiffLoading variant="bubbles" label="正在載入場次資訊..." />
        )}
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
                {trip.referenceVideoUrl && (
                  <a
                    href={trip.referenceVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
                    title="觀看潛點參考影片"
                  >
                    ▶ 影片
                  </a>
                )}
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
                {trip.startTime}
                {/* capacity null = 無上限 → 顯示「已報 N」；否則「剩 X/Y」 */}
                {" · "}
                {trip.capacity == null
                  ? `已報 ${trip.booked} 人`
                  : trip.available === 0
                  ? "已滿"
                  : `剩 ${trip.available}/${trip.capacity}`}
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
                max={trip.available ?? 99}   // null = 無上限 → 給 99 上限避免無限增加
                onChange={setParticipants}
              />
            </div>
            <Separator />
            {/* 潛次 */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">潛次</Label>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  最多 {trip.tankCount} 潛 · 每支 NT$ {trip.pricing.extraTank.toLocaleString()}（含空氣瓶）
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
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneTW(e.target.value))}
                  maxLength={11}
                  placeholder="0912-345678"
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
              inputMode="numeric"
              value={emergencyPhone}
              onChange={(e) =>
                setEmergencyPhone(formatPhoneTW(e.target.value))
              }
              maxLength={11}
              placeholder="0912-345678"
            />
          </div>
        </CollapsibleCard>

        {/* 潛伴清單 (人數 > 1 才出現) */}
        {companionSlots.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                潛伴資料 ({companionSlots.length} 位)
              </CardTitle>
              <p className="-mt-1 text-[11px] text-[var(--muted-foreground)]">
                可從常用潛伴選擇，或手動輸入。新填的潛伴會自動存到您的會員資料。
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

        {/* 付款方式（永遠展開 — v163 從個人資料卡片搬出來避免被折疊隱藏） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">付款方式</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["cash", "💵 現場"],
                  ["bank", "🏦 轉帳"],
                  ["linepay", "💚 LINE Pay"],
                  ["other", "📝 其他"],
                ] as const
              ).map(([k, label]) => {
                const lv1NoCash = vipLevel === 1 && k === "cash";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => !lv1NoCash && setPaymentMethod(k)}
                    disabled={lv1NoCash}
                    title={lv1NoCash ? "LV1 會員需於出發前 3 天付清，升等後可使用現場支付" : ""}
                    className={
                      lv1NoCash
                        ? "rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1.5 text-xs text-[var(--muted-foreground)] line-through cursor-not-allowed"
                        : paymentMethod === k
                        ? "rounded-md border-2 border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10 px-2 py-1.5 text-xs font-semibold"
                        : "rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
                    }
                  >
                    {label}
                    {lv1NoCash && " 🔒"}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-[var(--muted-foreground)]">
              {vipLevel === 1 && (
                <div className="mb-1 rounded bg-amber-50 px-2 py-1 text-amber-700">
                  🔒 LV1 會員需於出發前 3 天付清；升等至 LV2 可解鎖現場支付
                </div>
              )}
              {paymentMethod === "cash" && "出航當天現場結算"}
              {paymentMethod === "bank" && "預約後 7 天內匯款保留名額"}
              {paymentMethod === "linepay" && "預約後 7 天內完成 LINE Pay 並上傳截圖"}
              {paymentMethod === "other" && "請於下方填寫您要使用的付款方式"}
            </div>

            {/* 轉帳：展開銀行帳號 + 一鍵複製 */}
            {paymentMethod === "bank" && paymentInfo?.bank?.account && (
              <div className="rounded-lg border bg-blue-50/40 p-3 text-xs" style={{ borderColor: "rgba(96,165,250,0.4)" }}>
                <div className="mb-1 font-semibold text-blue-900">🏦 匯款資訊</div>
                <div className="space-y-0.5 text-blue-900">
                  <div>銀行：{paymentInfo.bank.name} {paymentInfo.bank.branch}</div>
                  <div>戶名：{paymentInfo.bank.holder}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-base font-mono font-bold tracking-wider">{paymentInfo.bank.account}</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(paymentInfo.bank.account).then(() => alert("✓ 帳號已複製"))}
                      className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700"
                    >
                      📋 複製
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* LINE Pay：展開 QR + Lite ID + 一鍵複製 */}
            {paymentMethod === "linepay" && (paymentInfo?.linepay?.qrUrl || paymentInfo?.linepay?.liteId) && (
              <div className="rounded-lg border bg-green-50/40 p-3 text-xs" style={{ borderColor: "rgba(74,222,128,0.4)" }}>
                <div className="mb-2 font-semibold text-green-900">💚 LINE Pay 轉帳</div>
                {paymentInfo.linepay.qrUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={paymentInfo.linepay.qrUrl}
                    alt="LINE Pay QR"
                    className="mb-2 h-40 w-40 rounded border bg-white object-contain"
                  />
                )}
                {paymentInfo.linepay.liteId && (
                  <div className="flex items-center gap-2 text-green-900">
                    <span>Lite ID：</span>
                    <span className="font-mono font-bold">{paymentInfo.linepay.liteId}</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(paymentInfo.linepay.liteId).then(() => alert("✓ Lite ID 已複製"))}
                      className="rounded bg-green-600 px-2 py-0.5 text-[10px] text-white hover:bg-green-700"
                    >
                      📋 複製
                    </button>
                  </div>
                )}
                <div className="mt-2 text-[10px] text-green-800">
                  完成轉帳後請至「我的預約」上傳截圖
                </div>
              </div>
            )}

            {/* 其他：文字輸入框 */}
            {paymentMethod === "other" && (
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="請說明使用的付款方式（例：街口支付 / 微信支付 / 現金匯款）"
              />
            )}

            {/* 抵用金折抵 — 有餘額才顯示 */}
            {creditBalance > 0 && (
              <div className="rounded-md border-2 border-[var(--color-coral)]/40 bg-[var(--color-coral)]/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">
                    🎁 使用抵用金折抵
                    <span className="ml-1 font-normal text-[var(--muted-foreground)]">
                      （餘額 NT$ {creditBalance.toLocaleString()}）
                    </span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setCreditUsed(Math.min(creditBalance, total))}
                    className="rounded-full bg-[var(--color-coral)] px-2 py-0.5 text-[10px] font-semibold text-white"
                  >
                    全部用
                  </button>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={Math.min(creditBalance, total)}
                  value={creditUsed || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setCreditUsed(Math.min(v, creditBalance, total));
                  }}
                  placeholder="NT$ 0"
                  className="text-center text-base font-bold"
                />
                {creditUsed > 0 && (
                  <div className="mt-1 text-[10px] tabular text-[var(--color-coral)]">
                    折抵 NT$ {creditUsed.toLocaleString()} → 應付 NT${" "}
                    {(total - creditUsed).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* v259：政策同意流程（兩個 checkbox + modal）+ 簽名 + 同意 banner */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📋 同意聲明（必填）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 取消政策 checkbox（v266：必須先查看才能勾選） */}
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors",
                cancellationRead
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <button
                type="button"
                disabled={!cancellationViewed}
                onClick={() => {
                  if (!cancellationViewed) {
                    setCancellationModalOpen(true);
                    return;
                  }
                  setCancellationRead(!cancellationRead);
                }}
                className={cn(
                  "flex flex-1 items-center gap-3 text-left text-sm",
                  !cancellationViewed && "cursor-not-allowed opacity-60",
                )}
                title={!cancellationViewed ? "請先點「查看 ›」閱讀政策內容" : ""}
              >
                <CheckCircle on={cancellationRead} />
                <span className="font-medium">
                  我已閱讀並同意《取消政策》
                  {!cancellationViewed && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-coral)]">
                      （請先查看內容）
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCancellationModalOpen(true)}
                className="rounded-full border border-[var(--color-phosphor)] px-3 py-1 text-[11px] font-medium text-[var(--color-phosphor)] hover:bg-[var(--color-phosphor)]/10"
              >
                查看 ›
              </button>
            </div>

            {/* 安全政策 checkbox（v266：必須先查看才能勾選） */}
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors",
                safetyRead
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <button
                type="button"
                disabled={!safetyViewed}
                onClick={() => {
                  if (!safetyViewed) {
                    setSafetyModalOpen(true);
                    return;
                  }
                  setSafetyRead(!safetyRead);
                }}
                className={cn(
                  "flex flex-1 items-center gap-3 text-left text-sm",
                  !safetyViewed && "cursor-not-allowed opacity-60",
                )}
                title={!safetyViewed ? "請先點「查看 ›」閱讀政策內容" : ""}
              >
                <CheckCircle on={safetyRead} />
                <span className="font-medium">
                  我已閱讀並同意《安全政策》
                  {!safetyViewed && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-coral)]">
                      （請先查看內容）
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSafetyModalOpen(true)}
                className="rounded-full border border-[var(--color-phosphor)] px-3 py-1 text-[11px] font-medium text-[var(--color-phosphor)] hover:bg-[var(--color-phosphor)]/10"
              >
                查看 ›
              </button>
            </div>

            {/* v260：手寫簽名（兩政策都勾才開啟） */}
            <div
              className={cn(
                "rounded-lg border-2 p-3 transition-opacity",
                (!cancellationRead || !safetyRead) && "opacity-40 pointer-events-none",
                signedHasInk
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5"
                  : "border-dashed border-[var(--border)] bg-white",
              )}
            >
              <Label className="mb-2 block text-xs">
                ✍️ 請於下方手寫簽名
                <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">
                  （用手指或滑鼠簽，作為法律有效電子簽署）
                </span>
              </Label>
              <SignaturePad
                height={200}
                onChange={(dataUrl, hasInk) => {
                  setSignatureDataUrl(hasInk ? dataUrl : null);
                  setSignedHasInk(hasInk);
                }}
              />
            </div>

            {/* 同意聲明 banner（兩政策都勾且簽完才綠色顯示） */}
            {cancellationRead && safetyRead && signedHasInk && (
              <div
                className="rounded-lg border-l-4 px-4 py-3 text-xs leading-relaxed"
                style={{
                  borderColor: "#06C755",
                  background: "rgba(6,199,85,0.08)",
                }}
              >
                <div className="font-bold" style={{ color: "#06C755" }}>
                  ✅ 完成預約即視同同意以上內容
                </div>
                <div className="mt-0.5 text-[var(--muted-foreground)]">
                  所有資料已填妥、簽署完成。
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* v259/v266：取消政策 Modal */}
        <Dialog open={cancellationModalOpen} onOpenChange={(o) => {
          setCancellationModalOpen(o);
          if (o) {
            // 開啟時標記已查看 → 解鎖 checkbox
            setCancellationViewed(true);
          } else {
            // 關閉時自動勾選同意
            setCancellationRead(true);
          }
        }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>📋 取消政策</DialogTitle>
            </DialogHeader>
            <PolicyText>{cancellationPolicy || "（管理員尚未設定取消政策）"}</PolicyText>
            <button
              type="button"
              onClick={() => setCancellationModalOpen(false)}
              className="mt-3 w-full rounded-full bg-[var(--color-phosphor)] py-2.5 text-sm font-semibold text-[var(--color-ocean-deep)]"
            >
              我已閱讀，關閉並同意
            </button>
          </DialogContent>
        </Dialog>

        {/* v259/v266：安全政策 Modal */}
        <Dialog open={safetyModalOpen} onOpenChange={(o) => {
          setSafetyModalOpen(o);
          if (o) {
            setSafetyViewed(true);
          } else {
            setSafetyRead(true);
          }
        }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>🛡️ 安全政策</DialogTitle>
            </DialogHeader>
            <PolicyText>{safetyPolicy || "（管理員尚未設定安全政策）"}</PolicyText>
            <button
              type="button"
              onClick={() => setSafetyModalOpen(false)}
              className="mt-3 w-full rounded-full bg-[var(--color-phosphor)] py-2.5 text-sm font-semibold text-[var(--color-ocean-deep)]"
            >
              我已閱讀，關閉並同意
            </button>
          </DialogContent>
        </Dialog>

        {/* 費用明細 + 送出 */}
        <Card className="sticky bottom-20 z-10 border-2 border-[var(--color-phosphor)]/30">
          <CardContent className="p-4">
            <div className="space-y-1 text-xs tabular text-[var(--muted-foreground)]">
              {trip.pricing.baseTrip > 0 && (
                <div className="flex justify-between">
                  <span>基本費（整單）</span>
                  <span>NT$ {trip.pricing.baseTrip.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>
                  潛水 {trip.pricing.extraTank.toLocaleString()} × {tankCount}{" "}
                  支 × {participants} 人
                </span>
                <span>NT$ {divesAmount.toLocaleString()}</span>
              </div>
              {/* v155：夜潛附加 / 水推附加列已移除（統一價） */}
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

        {/* v259：品牌 footer 收尾 */}
        <div className="px-4 pt-4 pb-2 text-center text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          🌊 東北角海王子 感謝您的信任
          <br />
          期待與您一起安全探索海洋
        </div>
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
            {gearOptions.map((g) => {
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

  // 收合狀態：摘要列 + 旁邊 quick-pick 下拉選單
  if (!open) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border-2 px-3 py-3",
          complete
            ? "border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5"
            : "border-dashed border-[var(--color-coral)] bg-[var(--color-coral)]/5",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          {complete ? (
            <Check className="h-4 w-4 flex-shrink-0 text-[var(--color-phosphor)]" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--color-coral)]" />
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-xs font-bold">潛伴 #{idx}</span>
            <span
              className={cn(
                "text-xs truncate",
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
        </button>

        {/* 快速從常用潛伴選 — 收合狀態也能用 */}
        {saved.length > 0 && (
          <select
            value={slot.id ?? ""}
            onChange={(e) => pickSaved(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-[10px] max-w-[8rem]"
            title="從常用潛伴選"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">— 選潛伴 —</option>
            {saved.map((c) => (
              <option key={c.id} value={c.id ?? ""}>
                {c.name}（{c.cert ?? "未填證照"}）
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-1 text-[var(--muted-foreground)] hover:bg-black/5 rounded"
          aria-label="編輯"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-[var(--color-phosphor)]/40 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">潛伴 #{idx}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-1 text-[var(--muted-foreground)] hover:bg-black/5"
          aria-label="收起"
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>

      {/* 常用潛伴 — 大型 chip 一鍵帶入 */}
      {saved.length > 0 && (
        <div className="mb-3 rounded-md bg-[var(--muted)] p-2">
          <div className="mb-1.5 text-[10px] font-semibold text-[var(--muted-foreground)]">
            從常用潛伴選 ({saved.length} 位) — 點一下自動帶入
          </div>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickSaved(c.id ?? "")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  slot.id === c.id
                    ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                    : "border-[var(--border)] bg-white",
                )}
              >
                {c.name}
                {c.cert && (
                  <span className="ml-1 text-[10px] opacity-70">
                    ({c.cert})
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => pickSaved("")}
              className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)]"
            >
              + 手動輸入
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input
          value={slot.name}
          onChange={(e) => onChange({ ...slot, name: e.target.value })}
          placeholder="姓名 *"
        />
        <Input
          type="tel"
          inputMode="numeric"
          value={slot.phone}
          onChange={(e) =>
            onChange({ ...slot, phone: formatPhoneTW(e.target.value) })
          }
          maxLength={11}
          placeholder="0912-345678"
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
