"use client";
import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Plane,
  Anchor,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SignaturePadProps } from "@/components/ui/SignaturePad";
import { PolicyText } from "@/components/ui/PolicyText";
import { MissingContactInfoModal } from "@/components/liff/MissingContactInfoModal";
import { Separator } from "@/components/ui/separator";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { useLiff } from "@/lib/liff/LiffProvider";
import { formatPhoneTW } from "@/lib/phone";
import { cn } from "@/lib/utils";

// v655：證照等級（與日潛一致）
const TOUR_CERTS = ["OW", "AOW", "DM", "Instructor"] as const;

const SignaturePad = dynamic<SignaturePadProps>(
  () => import("@/components/ui/SignaturePad").then((m) => m.SignaturePad),
  {
    loading: () => (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-white px-4 py-8 text-center text-xs text-[var(--muted-foreground)]">
        正在載入簽名板...
      </div>
    ),
  },
);

interface TourDetail {
  id: string;
  title: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  itinerary: unknown;
  diveSiteIds: string[];
  basePrice: number;
  deposit: number;
  depositDeadline: string | null;
  finalDeadline: string | null;
  depositDueDays?: number;
  capacity: number;
  booked: number;
  available: number;
  includes: string[];
  excludes: string[];
  addons: Array<{ id: string; label: string; priceDelta: number }>;
  sites: Array<{ id: string; name: string; description: string }>;
  activityNote?: string | null; // v666：活動提醒（客戶可見）
}

export default function TourDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = use(params);
  const router = useRouter();
  const liff = useLiff();
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [participants, setParticipants] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [cert, setCert] = useState<(typeof TOUR_CERTS)[number] | "">(""); // v655：證照等級
  const [logCount, setLogCount] = useState(""); // v655：自填潛水次數
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");
  const [notes, setNotes] = useState("");
  // v259：兩政策 + modal
  // v266：客戶必須先點「查看 ›」進去看過 modal 才能勾選同意
  const [cancellationViewed, setCancellationViewed] = useState(false);
  const [safetyViewed, setSafetyViewed] = useState(false);
  const [cancellationRead, setCancellationRead] = useState(false);
  const [safetyRead, setSafetyRead] = useState(false);
  const [cancellationModalOpen, setCancellationModalOpen] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  // v260：手寫簽名
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signedHasInk, setSignedHasInk] = useState(false);
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [safetyPolicy, setSafetyPolicy] = useState("");
  // v269：缺 phone/email 強制補資料 modal
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [mePhone, setMePhone] = useState<string | null>(null);
  const [missingInfoModalOpen, setMissingInfoModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 抵用金折抵
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditUsed, setCreditUsed] = useState(0);
  // v289：付款方式移到「我的預約 → 付款方式選擇」頁，這裡不再選

  useEffect(() => {
    liff
      .fetchWithAuth<TourDetail>(`/api/tours/${packageId}`)
      .then(setTour)
      .catch((e) => setError(e.message));
    // v647：移除 customer.view.product 記錄點（純瀏覽分析，不需稽核）
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setCancellationPolicy(c.cancellationPolicy ?? "");
        setSafetyPolicy(c.safetyPolicy ?? "");
      })
      .catch(() => {});
    // 取自己 creditBalance + email/phone (v269 modal 用)
    liff
      .fetchWithAuth<{
        creditBalance: number;
        realName: string | null;
        phone: string | null;
        email: string | null;
        cert: (typeof TOUR_CERTS)[number] | null;
        certNumber: string | null;
        logCount: number | null;
      }>("/api/me")
      .then((me) => {
        setCreditBalance(me.creditBalance ?? 0);
        if (me.realName) setRealName(me.realName);
        if (me.phone) setPhone(formatPhoneTW(me.phone));
        setMeEmail(me.email ?? null);
        setMePhone(me.phone ?? null);
        if (me.cert) setCert(me.cert);
        if (me.certNumber) setCertNumber(me.certNumber);
        if (me.logCount) setLogCount(String(me.logCount));
      })
      .catch(() => {});
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, liff.ready]);

  const total = useMemo(() => {
    if (!tour) return 0;
    const addonSum = tour.addons
      .filter((a) => selectedAddons[a.id])
      .reduce((s, a) => s + a.priceDelta, 0);
    return (tour.basePrice + addonSum) * participants;
  }, [tour, selectedAddons, participants]);

  const canSubmit =
    tour &&
    !submitting &&
    cancellationRead &&
    safetyRead &&
    signedHasInk &&
    realName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 8 &&
    cert !== "" &&                   // v655：證照等級必填
    logCount.trim().length >= 1;     // v655：潛水次數必填（新手填 0 也可）

  async function submit() {
    if (!tour || !canSubmit) return;
    // v269：送出前 check email/phone
    const needEmail = !meEmail || meEmail.trim().length < 5;
    const needPhone = !mePhone || mePhone.trim().length < 8;
    if (needEmail || needPhone) {
      setMissingInfoModalOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await liff.fetchWithAuth<{
        ok: true;
        booking: { id: string };
      }>("/api/bookings/tour", {
        method: "POST",
        body: JSON.stringify({
          tourId: tour.id,
          participants,
          selectedAddons: Object.keys(selectedAddons).filter(
            (k) => selectedAddons[k],
          ),
          notes: notes || undefined,
          creditUsed: Math.min(creditUsed, creditBalance, total),
          // v289：建立時不送 paymentMethod，後端寫 null
          agreedToTerms: true as const,
          // v260：手寫簽名 PNG data URL
          signatureDataUrl: signatureDataUrl ?? undefined,
          realName,
          phone,
          certNumber: certNumber.trim() || undefined,
          cert: cert || undefined,
          logCount: logCount ? Number(logCount) : undefined,
          emergencyContact: {
            name: emergencyName,
            phone: emergencyPhone,
            relationship: emergencyRel || "其他",
          },
        }),
      });
      router.push(`/liff/my?just=${res.booking.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  if (!tour) {
    return (
      <LiffShell title="潛水團" backHref="/liff/tour">
        {error ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-coral)]">
            錯誤：{error}
          </div>
        ) : (
          <LiffLoading variant="bubbles" label="正在載入潛水團資訊..." />
        )}
      </LiffShell>
    );
  }

  const depositTotal = tour.deposit * participants;

  return (
    <LiffShell title={tour.title} backHref="/liff/tour">
      <div className="relative h-48 bg-gradient-to-br from-[var(--color-ocean-deep)] to-[var(--color-ocean-surface)]">
        <div className="absolute inset-0 flex items-center justify-center text-white opacity-30">
          <Plane className="h-20 w-20" />
        </div>
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <div className="text-xs opacity-80 tabular">
            {tour.dateStart} → {tour.dateEnd}
          </div>
          <h1 className="text-xl font-bold">{tour.title}</h1>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <Card>
          <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">起跳</div>
              <div className="text-lg font-bold tabular text-[var(--color-coral)]">
                {tour.basePrice.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">訂金</div>
              <div className="text-lg font-bold tabular">
                {tour.deposit.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">剩餘</div>
              <div className="text-lg font-bold tabular">
                {tour.available}/{tour.capacity}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* v666：活動提醒（團層級，客戶可見）— 對齊桌機 /pclogin 與我的預約 */}
        {tour.activityNote && (
          <div className="rounded-lg bg-[#eafaf3] px-3.5 py-2.5 text-sm leading-relaxed text-[#0a7d4f]">
            📣 活動提醒：{tour.activityNote}
          </div>
        )}

        {/* v347：繳費期限說明 */}
        <div className="rounded-lg border border-[var(--color-coral)]/30 bg-[var(--color-coral)]/5 px-3 py-2 text-[12px] leading-relaxed text-[var(--foreground)]">
          💰 <b>繳費期限</b>：訂金請於<b>下訂後 {tour.depositDueDays ?? 7} 天內</b>繳清以保留名額；尾款請於<b>出發前 30 天</b>繳清
          {tour.finalDeadline ? `（${tour.finalDeadline.slice(0, 10)} 前）` : ""}。
        </div>

        {tour.sites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">潛點預覽</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {tour.sites.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-[var(--border)] p-2 text-xs"
                  >
                    <div className="flex items-center gap-1 font-semibold">
                      <Anchor className="h-3 w-3" />
                      {s.name}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[var(--muted-foreground)]">
                      {s.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(tour.includes.length > 0 || tour.excludes.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">含 / 不含</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[var(--color-phosphor)]/10 p-3">
                <div className="mb-1 font-bold">含</div>
                <ul className="space-y-1">
                  {tour.includes.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--color-phosphor)]" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-[var(--muted)] p-3">
                <div className="mb-1 font-bold">不含</div>
                <ul className="space-y-1">
                  {tour.excludes.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <X className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--muted-foreground)]" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {tour.addons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">加購</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tour.addons.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setSelectedAddons((s) => ({ ...s, [a.id]: !s[a.id] }))
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm",
                    selectedAddons[a.id]
                      ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold"
                      : "border-[var(--border)]",
                  )}
                >
                  <span>{a.label}</span>
                  <span className="tabular text-[var(--muted-foreground)]">
                    {a.priceDelta >= 0 ? "+" : ""}
                    {a.priceDelta.toLocaleString()}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">報名資料</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>人數</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setParticipants(Math.max(1, participants - 1))}
                >
                  -
                </Button>
                <span className="w-8 text-center text-lg font-bold tabular">
                  {participants}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setParticipants(Math.min(tour.available, participants + 1))
                  }
                >
                  +
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="realName">姓名 *</Label>
              <Input
                id="realName"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="本名 (與證照一致)"
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
            {/* v655：潛水經驗 — 證照等級 / 號碼 / 潛次（下單必填，方便教練掌握） */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="tour-cert">證照等級 *</Label>
                <select
                  id="tour-cert"
                  value={cert}
                  onChange={(e) => setCert(e.target.value as (typeof TOUR_CERTS)[number] | "")}
                  className={cn(
                    "mt-0 flex h-11 w-full appearance-none rounded-[var(--radius-card)] border bg-white px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    cert ? "border-[var(--color-phosphor)] text-[var(--color-ocean-deep)]" : "border-[var(--input)] text-[var(--muted-foreground)]",
                  )}
                >
                  <option value="">請選擇</option>
                  {TOUR_CERTS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="tour-logs">累計潛水支數 *</Label>
                <Input
                  id="tour-logs"
                  inputMode="numeric"
                  value={logCount}
                  onChange={(e) => setLogCount(e.target.value.replace(/\D/g, ""))}
                  placeholder="例: 25（新手填 0）"
                  className="text-center"
                />
              </div>
            </div>
            <Separator />
            <div className="text-sm font-semibold">緊急聯絡人 *</div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="姓名"
              />
              <Input
                value={emergencyRel}
                onChange={(e) => setEmergencyRel(e.target.value)}
                placeholder="關係"
              />
            </div>
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
          </CardContent>
        </Card>

        {/* 備註（v353：抽出成獨立、清楚標題的卡）*/}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">📝 備註 / 特殊需求</CardTitle>
            <p className="-mt-1 text-[11px] text-[var(--muted-foreground)]">選填。飲食 / 房型偏好 / 同行者 / 其他需求。</p>
          </CardHeader>
          <CardContent>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：素食、想住雙人房、與 OOO 同房…"
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-phosphor)]/40 resize-y"
            />
          </CardContent>
        </Card>

        {/* v289：付款方式不再於下單頁選，改到「我的預約 → 付款方式選擇」 */}
        <Card>
          <CardContent className="p-4">
            <div className="rounded-md border border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 p-3 text-xs text-[var(--color-ocean-deep)]">
              <div className="font-semibold mb-1">💳 下單後再選付款方式</div>
              <div className="text-[var(--muted-foreground)]">
                預約完成後請至「我的預約」→ <span className="font-semibold">付款方式選擇</span>，可選擇 🏦 轉帳 / 💚 LINE Pay / 📝 其他並上傳對應的付款截圖。
              </div>
            </div>
          </CardContent>
        </Card>

        {/* v259：政策同意流程（兩個 checkbox + modal）+ 簽名 + 同意 banner */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📋 同意聲明（必填）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3",
                cancellationRead
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <button
                type="button"
                disabled={!cancellationViewed}
                onClick={() => {
                  if (!cancellationViewed) { setCancellationModalOpen(true); return; }
                  setCancellationRead(!cancellationRead);
                }}
                className={cn("flex flex-1 items-center gap-3 text-left text-sm", !cancellationViewed && "cursor-not-allowed opacity-60")}
              >
                <div className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", cancellationRead ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]" : "border-[var(--muted-foreground)]")}>
                  {cancellationRead && <Check className="h-3 w-3 text-[var(--color-ocean-deep)]" />}
                </div>
                <span className="font-medium">
                  我已閱讀並同意《取消政策》
                  {!cancellationViewed && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-coral)]">（請先查看內容）</span>
                  )}
                </span>
              </button>
              <button type="button" onClick={() => setCancellationModalOpen(true)} className="rounded-full border border-[var(--color-phosphor)] px-3 py-1 text-[11px] font-medium text-[var(--color-phosphor)]">
                查看 ›
              </button>
            </div>

            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3",
                safetyRead
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <button
                type="button"
                disabled={!safetyViewed}
                onClick={() => {
                  if (!safetyViewed) { setSafetyModalOpen(true); return; }
                  setSafetyRead(!safetyRead);
                }}
                className={cn("flex flex-1 items-center gap-3 text-left text-sm", !safetyViewed && "cursor-not-allowed opacity-60")}
              >
                <div className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", safetyRead ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]" : "border-[var(--muted-foreground)]")}>
                  {safetyRead && <Check className="h-3 w-3 text-[var(--color-ocean-deep)]" />}
                </div>
                <span className="font-medium">
                  我已閱讀並同意《安全政策》
                  {!safetyViewed && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-coral)]">（請先查看內容）</span>
                  )}
                </span>
              </button>
              <button type="button" onClick={() => setSafetyModalOpen(true)} className="rounded-full border border-[var(--color-phosphor)] px-3 py-1 text-[11px] font-medium text-[var(--color-phosphor)]">
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
                <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">（作為法律有效電子簽署）</span>
              </Label>
              <SignaturePad
                height={200}
                onChange={(dataUrl, hasInk) => {
                  setSignatureDataUrl(hasInk ? dataUrl : null);
                  setSignedHasInk(hasInk);
                }}
              />
            </div>

            {cancellationRead && safetyRead && signedHasInk && (
              <div className="rounded-lg border-l-4 px-4 py-3 text-xs leading-relaxed" style={{ borderColor: "#06C755", background: "rgba(6,199,85,0.08)" }}>
                <div className="font-bold" style={{ color: "#06C755" }}>✅ 完成預約即視同同意以上內容</div>
                <div className="mt-0.5 text-[var(--muted-foreground)]">所有資料已填妥、簽署完成。</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* v259/v266/v281：取消政策 Modal */}
        <Dialog open={cancellationModalOpen} onOpenChange={(o) => {
          setCancellationModalOpen(o);
          setCancellationViewed(true);
          if (!o) setCancellationRead(true);
        }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>📋 取消政策</DialogTitle>
            </DialogHeader>
            <PolicyText>{cancellationPolicy || "（管理員尚未設定取消政策）"}</PolicyText>
            <button type="button" onClick={() => {
              setCancellationViewed(true);
              setCancellationRead(true);
              setCancellationModalOpen(false);
            }} className="mt-3 w-full rounded-full bg-[var(--color-phosphor)] py-2.5 text-sm font-semibold text-[var(--color-ocean-deep)]">
              我已閱讀，關閉並同意
            </button>
          </DialogContent>
        </Dialog>

        {/* v259/v266/v281：安全政策 Modal */}
        <Dialog open={safetyModalOpen} onOpenChange={(o) => {
          setSafetyModalOpen(o);
          setSafetyViewed(true);
          if (!o) setSafetyRead(true);
        }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>🛡️ 安全政策</DialogTitle>
            </DialogHeader>
            <PolicyText>{safetyPolicy || "（管理員尚未設定安全政策）"}</PolicyText>
            <button type="button" onClick={() => {
              setSafetyViewed(true);
              setSafetyRead(true);
              setSafetyModalOpen(false);
            }} className="mt-3 w-full rounded-full bg-[var(--color-phosphor)] py-2.5 text-sm font-semibold text-[var(--color-ocean-deep)]">
              我已閱讀，關閉並同意
            </button>
          </DialogContent>
        </Dialog>

        {/* v807：抵用金操作整合進底部付款總結（原獨立卡片移除，金額只在一處出現） */}
        <Card className="sticky bottom-4 z-10">
          <CardContent className="p-4">
            {creditBalance > 0 ? (
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-dashed border-[var(--border)] pb-2">
                <Label className="text-xs shrink-0">
                  🎁 抵用金
                  <span className="ml-1 font-normal text-[var(--muted-foreground)]">（餘額 NT$ {creditBalance.toLocaleString()}）</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={Math.min(creditBalance, total)}
                    value={creditUsed || ""}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setCreditUsed(Math.min(v, creditBalance, total));
                    }}
                    placeholder="0"
                    className="h-8 w-20 text-right text-sm font-bold tabular"
                  />
                  <button
                    type="button"
                    onClick={() => setCreditUsed(creditUsed >= Math.min(creditBalance, total) ? 0 : Math.min(creditBalance, total))}
                    className="shrink-0 rounded-full bg-[var(--color-coral)] px-2.5 py-1 text-[10px] font-semibold text-white"
                  >
                    {creditUsed >= Math.min(creditBalance, total) && creditUsed > 0 ? "清除" : "全額折抵"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-2 flex items-center justify-between border-b border-dashed border-[var(--border)] pb-2 text-[11px] text-[var(--muted-foreground)]">
                <span>🎁 抵用金：目前無可折抵</span>
                <span>禮金入帳後下次下單可折</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">應付總額</div>
                <div className="text-2xl font-bold tabular text-[var(--color-coral)]">
                  NT$ {Math.max(0, total - Math.min(creditUsed, creditBalance, total)).toLocaleString()}
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted-foreground)] tabular">
                  訂金 NT$ {depositTotal.toLocaleString()}
                  {creditUsed > 0 && (
                    <span className="ml-2 text-[var(--color-coral)]">
                      · 已折抵 NT$ {Math.min(creditUsed, creditBalance, total).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ocean"
                size="lg"
                disabled={!canSubmit}
                onClick={submit}
              >
                {submitting ? "送出中..." : "送出報名"}
              </Button>
            </div>
            {/* v781：送出報名（含簽名上傳）→ 潛水員踢水遮罩 */}
            {submitting && (
              <DiverLoader
                overlay
                label="送出報名中，請稍候…"
                subLabel="正在上傳簽名與建立訂單；請勿關閉或重複送出"
              />
            )}
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

      {/* v269：缺 phone/email 強制補資料 modal */}
      <MissingContactInfoModal
        open={missingInfoModalOpen}
        missingEmail={!meEmail || meEmail.trim().length < 5}
        missingPhone={!mePhone || mePhone.trim().length < 8}
        defaultEmail={meEmail ?? ""}
        defaultPhone={mePhone ?? ""}
        onClose={() => setMissingInfoModalOpen(false)}
        onSaved={(data) => {
          setMissingInfoModalOpen(false);
          setMeEmail(data.email);
          setMePhone(data.phone);
          setTimeout(() => { void submit(); }, 100);
        }}
      />
    </LiffShell>
  );
}
