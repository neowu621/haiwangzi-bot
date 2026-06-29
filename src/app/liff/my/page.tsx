"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Plane,
  Upload,
  Check,
  Edit3,
  XCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { Lightbox } from "@/components/ui/lightbox";
import { TripPhotoGallery } from "@/components/admin/TripPhotoGallery";
import { useLiff } from "@/lib/liff/LiffProvider";
import { formatPhoneTW } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { deriveBookingDisplay } from "@/lib/booking-status"; // v319
import { InsuranceNotice } from "@/components/InsuranceNotice"; // v582
import { computePaymentDeadline, activityStartFromTaipei } from "@/lib/payment-deadline"; // v367

type GearItemType =
  | "BCD"
  | "regulator"
  | "wetsuit"
  | "fins"
  | "mask"
  | "computer"
  | "full_set";

interface RentalGear {
  itemType: GearItemType;
  price: number;
  qty?: number;
}

interface MyBooking {
  id: string;
  type: "daily" | "tour";
  status:
    | "pending"
    | "awaiting_verify"     // v276
    | "confirmed"
    | "cancelled_by_user"
    | "cancelled_by_weather"
    | "cancelled_unpaid"    // v276
    | "completed"
    | "no_show";
  paymentStatus:
    | "pending"
    | "deposit_paid"
    | "fully_paid"
    | "refunding"
    | "refunded";
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  creditUsed: number; // v706：抵用金折抵額
  participants: number;
  tankCount: number | null; // v704：客戶實際選的潛次（舊單 null → fallback ref.tankCount）
  rentalGear: RentalGear[];
  notes: string | null;
  ref:
    | { date: string; startTime: string; sites: string[]; tankCount?: number; activityNote?: string | null }
    | { title: string; dateStart: string; dateEnd: string; sites: string[]; activityNote?: string | null }
    | null;
  paymentProofs: Array<{
    id: string;
    type: "deposit" | "final" | "refund";
    amount: number;
    verifiedAt: string | null;
    url: string | null;
    thumb?: string | null; // v379：縮圖（DB，即時顯示）
    uploadedAt: string;
  }>;
  // v289：同意聲明
  signatureUrl?: string | null;
  signedAt?: string | null;
  agreedToTermsAt?: string | null;
  // 後端：daily booking 額外加 refId 給 photo gallery 用（daily only）
  refId?: string;
  // 多人預約：本人以外的潛伴明細
  participantDetails?: Array<{
    id?: string;
    name: string;
    phone: string;
    cert: "OW" | "AOW" | "Rescue" | "DM" | "Instructor" | null;
    certNumber: string;
    logCount: number;
    relationship: string;
    isSelf?: boolean;
  }>;
  createdAt: string;
}

// v288：訂單狀態 + 付款狀態雙 badge（兩個維度都顯示）
type BadgeVariant = "default" | "muted" | "coral" | "gold";
function getOrderBadge(status: MyBooking["status"]): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "pending":              return { label: "待確認",      variant: "gold" };
    case "awaiting_verify":      return { label: "⏳ 匯款待確認", variant: "gold" };
    case "confirmed":            return { label: "✓ 已確認",    variant: "default" };
    case "completed":            return { label: "✓ 活動結束",  variant: "muted" };
    case "cancelled_unpaid":     return { label: "活動取消（訂單不成立）", variant: "muted" };
    case "cancelled_by_user":    return { label: "活動取消（客戶取消）",   variant: "coral" };
    case "cancelled_by_weather": return { label: "活動取消（天氣）",       variant: "coral" };
    case "no_show":              return { label: "⚠ 活動取消（未到場）",  variant: "coral" };
  }
}
function getPaymentBadge(p: MyBooking["paymentStatus"]): { label: string; variant: BadgeVariant } {
  switch (p) {
    case "pending":       return { label: "💴 待付款",    variant: "gold" };
    case "deposit_paid":  return { label: "💰 訂金已付",   variant: "default" };
    case "fully_paid":    return { label: "✅ 已付清",    variant: "default" };
    case "refunding":     return { label: "退款處理中",   variant: "gold" };
    case "refunded":      return { label: "↩ 已退款",    variant: "muted" };
  }
}

interface GearOption { itemType: GearItemType; label: string; price: number; }

const GEAR_OPTIONS_DEFAULT: GearOption[] = [
  { itemType: "BCD", label: "BCD", price: 200 },
  { itemType: "regulator", label: "調節器", price: 200 },
  { itemType: "wetsuit", label: "防寒衣", price: 300 },
  { itemType: "fins", label: "蛙鞋", price: 100 },
  { itemType: "mask", label: "面鏡", price: 100 },
  { itemType: "computer", label: "潛水電腦錶", price: 300 },
  { itemType: "full_set", label: "整套優惠", price: 800 },
];

// 在頁面 mount 後從 /api/site-config 更新（若後台有設定）
let _cachedGearOptions: GearOption[] | null = null;
async function fetchGearOptions(): Promise<GearOption[]> {
  if (_cachedGearOptions) return _cachedGearOptions;
  try {
    const res = await fetch("/api/site-config");
    const cfg: { gearRentalPrices?: Partial<Record<GearItemType, number>> } = await res.json();
    const prices = cfg.gearRentalPrices ?? {};
    if (Object.keys(prices).length > 0) {
      _cachedGearOptions = GEAR_OPTIONS_DEFAULT.map(g => ({ ...g, price: prices[g.itemType] ?? g.price }));
      return _cachedGearOptions;
    }
  } catch { /* fallback */ }
  return GEAR_OPTIONS_DEFAULT;
}

function isUpcoming(b: MyBooking) {
  if (
    b.status === "cancelled_by_user" ||
    b.status === "cancelled_by_weather" ||
    b.status === "cancelled_unpaid" ||
    b.status === "completed" ||
    b.status === "no_show"
  )
    return false;
  if (!b.ref) return false;
  const d = "date" in b.ref ? b.ref.date : b.ref.dateStart;
  return new Date(d) >= new Date(new Date().toDateString());
}

// v285：客戶端不再支援「修改」，改為「取消訂單」（修改 = 取消 + 重新下訂）
//   可取消條件：尚未到期 + 未完成 + 未取消 + 未退款
function isCancellable(b: MyBooking) {
  return (
    isUpcoming(b) &&
    b.status !== "completed" &&
    b.status !== "no_show" &&
    !b.status.startsWith("cancelled") &&
    b.paymentStatus !== "refunded" &&
    b.paymentStatus !== "refunding"
  );
}

export default function MyBookingsPage() {
  const liff = useLiff();
  // v288：localStorage cache 改在 useEffect 讀 — 避免 SSR 與 client 狀態不一致造成骨架閃
  //   SSR HTML 與 client 首次 render 都是「空 tabs」，瀏覽器不會先畫骨架再切資料
  //   client mount 後 useEffect 同步讀 cache → setBookings，沒讀到才顯骨架等 fetch
  const BOOKINGS_CACHE_KEY = "haiwangzi:bookings:my:v1";

  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [wishes, setWishes] = useState<Array<{
    id: string;
    type: string;
    preferredDate: string;
    diveSiteIds: string[];
    otherSites: string | null;
    participants: number;
    status: "pending" | "discussing" | "converted" | "cancelled";
    lastActivityAt: string;
    convertedTripId: string | null;
    convertedTourId: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);  // v288: 預設 false，useEffect 讀完 cache 再決定
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false); // 標記 cache 已讀過、可顯 empty/skeleton
  const [editing, setEditing] = useState<MyBooking | null>(null);
  const [agreementBooking, setAgreementBooking] = useState<MyBooking | null>(null); // v289：同意聲明彈窗
  const [gearOptions, setGearOptions] = useState<GearOption[]>(GEAR_OPTIONS_DEFAULT);
  // v289：政策內容（給同意聲明彈窗用）
  const [policies, setPolicies] = useState<{ cancellation: string; safety: string }>({ cancellation: "", safety: "" });

  useEffect(() => {
    fetchGearOptions().then(setGearOptions);
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setPolicies({
        cancellation: c.cancellationPolicy ?? "",
        safety: c.safetyPolicy ?? "",
      }))
      .catch(() => {});
  }, []);

  const reload = useCallback(() => {
    setRefreshing(true);
    // 並行載入願望單（失敗不影響訂單）
    liff
      .fetchWithAuth<{ wishes: typeof wishes }>("/api/dive-wishes")
      .then((d) => setWishes(d.wishes ?? []))
      .catch(() => {});
    liff
      .fetchWithAuth<{ bookings: MyBooking[] }>("/api/bookings/my")
      .then((d) => {
        setBookings(d.bookings);
        try {
          // v293：剝掉 R2 presigned URL（10 分鐘 TTL），下次讀 cache 時不會看到 broken image
          const cacheable = d.bookings.map((b) => ({
            ...b,
            signatureUrl: null,
            paymentProofs: b.paymentProofs.map((p) => ({ ...p, url: null })),
          }));
          window.localStorage.setItem(BOOKINGS_CACHE_KEY, JSON.stringify(cacheable));
        } catch { /* quota or disabled — ignore */ }
      })
      .catch(() => { /* 失敗時保留 cache，不清空 */ })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
        setHydrated(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 1. client mount 後同步讀 cache（在 effect 內讀避免 SSR mismatch）
    let hasCache = false;
    try {
      const raw = window.localStorage.getItem(BOOKINGS_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setBookings(parsed as MyBooking[]);
        hasCache = true;
      }
    } catch { /* ignore */ }
    setHydrated(true);
    // 2. 沒 cache → 顯骨架；有 cache → 直接拉刷新
    if (!hasCache) setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const up: MyBooking[] = [];
    const done: MyBooking[] = [];
    const cancelled: MyBooking[] = [];
    for (const b of bookings) {
      if (b.status === "cancelled_by_user" || b.status === "cancelled_by_weather" || b.status === "cancelled_unpaid") {
        cancelled.push(b);
      } else if (b.status === "completed" || b.status === "no_show") {
        done.push(b);
      } else if (isUpcoming(b)) {
        up.push(b);
      } else {
        done.push(b);
      }
    }
    return { up, done, cancelled };
  }, [bookings]);

  // v285：取消訂單 handler
  async function cancelBooking(b: MyBooking) {
    const hasPaid = b.paidAmount > 0;
    const msg = hasPaid
      ? `確定要取消這筆訂單嗎？\n\n您已付 NT$ ${b.paidAmount.toLocaleString()}\n→ 取消後需另外點「申請退款」處理退款。\n\n（想改人數或內容請取消後重新預約）`
      : `確定要取消這筆訂單嗎？\n\n尚未付款，取消後訂單不成立、不需退款。\n（想改人數或內容請取消後重新預約）`;
    if (!confirm(msg)) return;
    try {
      await liff.fetchWithAuth(`/api/bookings/${b.id}`, { method: "DELETE" });
      // 重抓
      reload();
    } catch (e) {
      alert("取消失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // v582：剛下訂(/liff/my?just=<id>)→ 顯示個人海域險安心提醒
  const [justBooked, setJustBooked] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("just")) setJustBooked(true);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LiffShell title="我的預約" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <div className="px-4 pt-4">
        {/* v582：下訂後安心提醒 — 建議自行加保個人海域險 */}
        {justBooked && (
          <div className="mb-3">
            <InsuranceNotice variant="compact" />
          </div>
        )}
        {/* v698：通知中心入口移除(已移至底部「訊息通知」分頁) */}
        {/* v267：背景刷新指示（有快取資料 + 正在拉新資料時顯示） */}
        {refreshing && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-phosphor)]/10 px-3 py-1 text-[10px] text-[var(--color-phosphor)]">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50 60" />
            </svg>
            正在更新最新訂單⋯
          </div>
        )}
        <Tabs defaultValue="up" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="up">
              即將前往 ({grouped.up.length})
            </TabsTrigger>
            <TabsTrigger value="wishes" className="relative">
              📝 願望單
              {wishes.filter((w) => w.status === "pending" || w.status === "discussing" || w.status === "converted").length > 0 && (
                <span className="ml-1 text-[10px]">({wishes.filter((w) => w.status === "pending" || w.status === "discussing" || w.status === "converted").length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="done">
              活動結束 ({grouped.done.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              活動取消 ({grouped.cancelled.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="up" className="space-y-3">
            {/* v288：所有 empty/skeleton 都等 hydrated 後才顯，避免 SSR HTML 與 client 不一致 */}
            {hydrated && loading && bookings.length === 0 && <LiffLoading variant="skeleton" count={3} label="正在載入您的訂單..." />}
            {hydrated && !loading && grouped.up.length === 0 && <EmptyState />}
            {grouped.up.map((b) => (
              <BookingCard key={b.id} b={b} onCancel={() => cancelBooking(b)} onOpenAgreement={() => setAgreementBooking(b)} />
            ))}
          </TabsContent>
          <TabsContent value="wishes" className="space-y-3">
            <div className="rounded-lg bg-[var(--color-phosphor)]/10 p-3 text-xs text-[var(--color-ocean-deep)]">
              💡 找不到喜歡的場次嗎？告訴老闆您想潛的日期、潛點、人數，老闆會回覆討論並開出專屬場次。
            </div>
            <Link href="/liff/wishes/new">
              <Button className="w-full" variant="ocean">📝 提出新願望單</Button>
            </Link>
            {hydrated && wishes.length === 0 && (
              <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                還沒有願望單
              </Card>
            )}
            {wishes.map((w) => {
              const typeLabel: Record<string, string> = {
                boat: "🚤 船潛", shore: "🏖 岸潛", night: "🌙 夜潛", tour: "✈️ 潛水團",
              };
              const statusMeta: Record<string, { label: string; variant: BadgeVariant }> = {
                pending: { label: "🟡 待回覆", variant: "gold" },
                discussing: { label: "💬 討論中", variant: "gold" },
                converted: { label: "🟢 場次已開", variant: "default" },
                cancelled: { label: "⚪ 已取消", variant: "muted" },
              };
              const meta = statusMeta[w.status] ?? { label: w.status, variant: "muted" as const };
              return (
                <Link key={w.id} href={`/liff/wishes/${w.id}`}>
                  <Card className="p-3 cursor-pointer hover:bg-[var(--muted)]/30">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={meta.variant} className="text-[11px]">{meta.label}</Badge>
                        <span className="text-sm font-semibold">{typeLabel[w.type] ?? w.type}</span>
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] tabular">
                        {new Date(w.lastActivityAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-xs space-y-0.5 text-[var(--muted-foreground)]">
                      <div>📅 {w.preferredDate.slice(0, 10)} · 👥 ×{w.participants}</div>
                      <div className="line-clamp-1">📍 {[...w.diveSiteIds, w.otherSites ?? ""].filter(Boolean).join("、") || "—"}</div>
                    </div>
                    {w.status === "converted" && (w.convertedTripId || w.convertedTourId) && (
                      <div className="mt-1.5 text-[11px] text-emerald-700 font-bold">🎉 已開場次，點進去預約</div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </TabsContent>
          <TabsContent value="done" className="space-y-3">
            {hydrated && grouped.done.length === 0 && <EmptyState text="還沒有完成紀錄" />}
            {grouped.done.map((b) => (
              <BookingCard key={b.id} b={b} onCancel={() => cancelBooking(b)} onOpenAgreement={() => setAgreementBooking(b)} />
            ))}
          </TabsContent>
          <TabsContent value="cancelled" className="space-y-3">
            {hydrated && grouped.cancelled.length === 0 && (
              <EmptyState text="沒有已取消的訂單" />
            )}
            {grouped.cancelled.map((b) => (
              <BookingCard key={b.id} b={b} onCancel={() => cancelBooking(b)} onOpenAgreement={() => setAgreementBooking(b)} />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <EditBookingDialog
        booking={editing}
        gearOptions={gearOptions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      {/* v289：同意聲明彈窗 */}
      <AgreementDialog
        booking={agreementBooking}
        cancellationPolicy={policies.cancellation}
        safetyPolicy={policies.safety}
        onClose={() => setAgreementBooking(null)}
      />
    </LiffShell>
  );
}

// v289：同意聲明彈窗 — 簽名圖 + 簽署時間 + 取消政策 + 安全政策
function AgreementDialog({
  booking,
  cancellationPolicy,
  safetyPolicy,
  onClose,
}: {
  booking: MyBooking | null;
  cancellationPolicy: string;
  safetyPolicy: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>同意聲明</DialogTitle>
        </DialogHeader>
        {booking && (
          <div className="space-y-4 text-sm">
            {/* 1. 簽名圖 + 簽署時間 */}
            <div>
              <div className="text-xs font-semibold text-[var(--muted-foreground)] mb-1">您的簽名</div>
              {booking.signatureUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={booking.signatureUrl}
                  alt="您的簽名"
                  className="w-full rounded-md border border-[var(--border)] bg-white"
                />
              ) : (
                <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
                  此訂單無簽名紀錄（可能為較早版本建立）
                </div>
              )}
              <div className="mt-1 text-[11px] text-[var(--muted-foreground)] tabular">
                簽署時間：{booking.signedAt
                  ? new Date(booking.signedAt).toLocaleString("zh-TW")
                  : (booking.agreedToTermsAt ? new Date(booking.agreedToTermsAt).toLocaleString("zh-TW") : "—")}
              </div>
            </div>
            {/* 2. 取消政策 */}
            <div>
              <div className="text-xs font-semibold text-[var(--muted-foreground)] mb-1">📜 取消政策</div>
              <div className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs leading-relaxed">
                {cancellationPolicy || "（尚未設定取消政策）"}
              </div>
            </div>
            {/* 3. 安全政策 */}
            <div>
              <div className="text-xs font-semibold text-[var(--muted-foreground)] mb-1">🛟 潛水安全注意事項</div>
              <div className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs leading-relaxed">
                {safetyPolicy || "（尚未設定安全政策）"}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ text = "尚無預約紀錄" }: { text?: string }) {
  return (
    <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
      {text}
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href="/liff/calendar"
          className="rounded-full bg-[var(--color-phosphor)] px-4 py-2 text-xs font-bold text-[var(--color-ocean-deep)]"
        >
          看日潛
        </Link>
        <Link
          href="/liff/tour"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-bold"
        >
          看潛水團
        </Link>
      </div>
    </Card>
  );
}

function BookingCard({
  b,
  onCancel,
  onOpenAgreement,
}: {
  b: MyBooking;
  onCancel: () => void;
  onOpenAgreement: () => void;
}) {
  const isDaily = b.type === "daily";
  const ref = b.ref;
  const needsPayment =
    b.paymentStatus !== "fully_paid" &&
    b.paymentStatus !== "refunded" &&
    b.totalAmount > 0;
  // v367：付款截止日 = min(下訂+10天, 活動出發前48小時)。修正先前截止日可能晚於活動日的 bug。
  const paymentDeadline = (() => {
    if (!needsPayment) return null;
    if (b.paymentStatus !== "pending") return null;
    const activityStart =
      ref && "date" in ref
        ? activityStartFromTaipei(ref.date, ref.startTime)
        : ref && "dateStart" in ref
          ? activityStartFromTaipei(ref.dateStart, null)
          : null;
    return computePaymentDeadline(b.createdAt, activityStart);
  })();
  const daysLeft = paymentDeadline
    ? Math.ceil((paymentDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const progress =
    b.totalAmount > 0
      ? Math.min(100, Math.round((b.paidAmount / b.totalAmount) * 100))
      : 0;
  // 日潛(一次付清)4 階段進度：預約 / 要求匯款（建單即亮）/ 匯款確認 / 活動
  const dailyProgress = (() => {
    let done = 2; // 預約 + 要求匯款：訂單一建立即完成
    if (b.paymentStatus === "fully_paid") done++; // 匯款確認
    if (b.status === "completed") done++; // 活動
    return Math.round((done / 4) * 100);
  })();
  const cancellable = isCancellable(b);
  // v698：每筆預約預設縮起,點擊展開
  const [open, setOpen] = useState(false);
  const d = deriveBookingDisplay({
    status: b.status,
    paymentStatus: b.paymentStatus,
    createdAt: b.createdAt,
    activityDate: (ref && "date" in ref) ? ref.date : (ref && "dateStart" in ref ? ref.dateStart : null),
  });
  const [proofLightbox, setProofLightbox] = useState<{
    url: string;
    caption?: string;
  } | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  // v367：付款方式選擇按鈕點擊回饋（避免「沒反應」誤以為壞掉）
  const [paying, setPaying] = useState(false);
  const [paySlow, setPaySlow] = useState(false);
  useEffect(() => {
    if (!paying) return;
    const t = setTimeout(() => setPaySlow(true), 6000);
    return () => clearTimeout(t);
  }, [paying]);
  // 日潛已結束（completed 或日期過了）→ 顯示「今日照片」入口
  const showPhotoEntry =
    isDaily &&
    b.refId &&
    (b.status === "completed" ||
      (ref && "date" in ref && ref.date < new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })));

  // v293：依使用者指定 5 行排版
  //   1. 📅 類型 + ×人 + ×支
  //   2. ⊙ 地點 + 日期時間
  //   3. 訂單狀態 / 付款狀態 / 取消訂單 / 同意聲明（橫排）
  //   4. 主 CTA：付款方式選擇
  //   5. ⏰ 截止日 (左) / 應付金額 (右)
  return (
    <Card className={cn(b.type === "tour" && "border-l-4 border-l-[var(--color-coral)]")}>
      <CardContent className="p-4 space-y-2">
        {/* Row 1：類型 + 人數 + 氣瓶（v698：點擊整列展開/收起，右側顯示狀態/金額/箭頭）*/}
        <div className="flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => setOpen((o) => !o)}>
          {isDaily ? <CalendarDays className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
          <span className="text-sm font-bold">{isDaily ? "日潛" : "旅遊潛水"}</span>
          <Badge variant="muted" className="text-[10px]">×{b.participants} 人</Badge>
          {isDaily && ((b.tankCount ?? (ref && "tankCount" in ref ? ref.tankCount : 0)) ?? 0) > 0 && (
            // v704：顯示客戶實際選的潛次（每人）；舊單沒存 → fallback 場次預設
            <Badge variant="muted" className="text-[10px]">×{b.tankCount ?? (ref && "tankCount" in ref ? ref.tankCount : 0)} 支</Badge>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <Badge variant={d.variant} className="text-[10px]">{d.label}</Badge>
            {b.totalAmount > 0 && <span className="text-sm font-bold tabular text-[var(--color-coral)]">NT$ {b.totalAmount.toLocaleString()}</span>}
            <ChevronRight className={cn("h-4 w-4 text-[var(--muted-foreground)] transition-transform", open && "rotate-90")} />
          </span>
        </div>

        {/* Row 2：地點 + 日期時間 / tour 標題 + 日期區間 */}
        {ref && "date" in ref && (
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {ref.sites.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                <MapPin className="h-3 w-3" />
                {ref.sites.join(" · ")}
              </span>
            )}
            <span className="font-bold tabular">{ref.date} {ref.startTime}</span>
          </div>
        )}
        {ref && "title" in ref && (
          <div>
            <div className="text-base font-bold leading-tight">{ref.title}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)] tabular">
              <CalendarDays className="h-3 w-3" />
              {ref.dateStart} → {ref.dateEnd}
            </div>
          </div>
        )}

        {/* v698：以下為展開後才顯示的明細 */}
        {open && (<>
        {/* v666：活動提醒（場次/團層級，客戶可見）— 對齊桌機 /pclogin */}
        {ref?.activityNote && (
          <div className="rounded-md bg-[#eafaf3] px-2.5 py-1.5 text-xs leading-relaxed text-[#0a7d4f]">
            📣 活動提醒：{ref.activityNote}
          </div>
        )}

        {/* Row 3：狀態 + 動作橫排（v319：單一衍生 status / 取消 / 同意聲明）*/}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={d.variant} className="text-[11px]">{d.label}</Badge>
          {cancellable && (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="h-7 gap-1 px-2 text-[11px]"
              style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
            >
              ✕ 取消訂單
            </Button>
          )}
          <button
            type="button"
            onClick={onOpenAgreement}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--color-ocean-deep)] underline underline-offset-2 hover:opacity-70"
          >
            📜 同意聲明
          </button>
        </div>

        {b.rentalGear.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {b.rentalGear.map((g) => (
              <span
                key={g.itemType}
                className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px]"
              >
                {gearLabel(g.itemType)}
                {(g.qty ?? 1) > 1 && <span className="ml-0.5 font-bold tabular">×{g.qty}</span>}
              </span>
            ))}
          </div>
        )}

        {b.totalAmount > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">{b.type === "tour" ? "付款進度" : "訂單進度"}</span>
              {b.type === "tour" && (
                <span className="tabular font-semibold">
                  {b.paidAmount.toLocaleString()} / {b.totalAmount.toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full bg-[var(--color-phosphor)]"
                style={{ width: `${b.type === "tour" ? progress : dailyProgress}%` }}
              />
            </div>
            <div className="mt-2 flex gap-1">
              {(b.type === "tour"
                ? [
                    { label: "預約", done: true },
                    { label: "訂金", done: b.paidAmount >= b.depositAmount },
                    { label: "尾款", done: b.paymentStatus === "fully_paid" },
                    { label: "出發", done: b.status === "completed" },
                  ]
                : [
                    { label: "預約", done: true },
                    { label: "要求匯款", done: true },
                    { label: "匯款確認", done: b.paymentStatus === "fully_paid" },
                    { label: "活動", done: b.status === "completed" },
                  ]
              ).map((s, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-0.5"
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                      s.done
                        ? "bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                    )}
                  >
                    {s.done ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            {/* v672：明確拆「已付訂金 / 尾款」金額（對齊桌機 /pclogin；截止日見上方付款鈕旁 ⏰）*/}
            {b.type === "tour" && b.paidAmount > 0 && b.totalAmount - b.paidAmount > 0 && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-medium text-[#0a7d4f]">已付訂金 NT$ {b.paidAmount.toLocaleString()}</span>
                <span className="font-bold text-[var(--color-coral)]">尾款 NT$ {(b.totalAmount - b.paidAmount).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* v289：下方 — 付款方式選擇（左）+ 截止日提醒（緊鄰右側）/ 金額（中）/ 申請退款（右） */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          {/* 左：付款方式選擇（主要 CTA）+ 截止日提醒 */}
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            {needsPayment ? (
              <>
                <Link
                  href={`/liff/payment/${b.id}`}
                  onClick={() => setPaying(true)}
                  aria-disabled={paying}
                  className={paying ? "pointer-events-none" : ""}
                >
                  <button
                    disabled={paying}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-gold)] px-3 py-2 text-xs font-bold text-[var(--color-ocean-deep)] shadow-sm whitespace-nowrap disabled:opacity-80"
                  >
                    {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {paying ? "開啟中…" : "付款方式選擇"}
                  </button>
                </Link>
                {paymentDeadline && daysLeft !== null && (
                  <div
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
                    style={
                      daysLeft <= 3
                        ? { background: "rgba(255,123,90,0.12)", color: "var(--color-coral)" }
                        : { background: "rgba(255,184,0,0.12)", color: "#9a7a00" }
                    }
                  >
                    ⏰ {paymentDeadline.toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} 前付清
                    {daysLeft > 0 ? `（剩 ${daysLeft} 天）` : "（已逾期）"}
                  </div>
                )}
                {paying && paySlow && (
                  <div className="w-full text-[10px] text-[var(--muted-foreground)]">
                    載入較久…可能網路較慢。若遲遲沒反應，請關掉重開或稍後再試。
                  </div>
                )}
              </>
            ) : (
              <div className="text-[10px] text-[var(--muted-foreground)]">總金額</div>
            )}
          </div>
          {/* 中：金額（永遠顯示）— v706：待付時顯示「應付 = 總額 − 已付(含抵用金)」，非「總額」 */}
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-[var(--muted-foreground)]">
              {needsPayment ? "應付金額" : ""}
            </div>
            <div className="text-base font-bold tabular text-[var(--color-coral)]">
              NT$ {(needsPayment ? Math.max(0, b.totalAmount - b.paidAmount) : b.totalAmount).toLocaleString()}
            </div>
            {b.creditUsed > 0 && (
              <div className="text-[10px] text-[var(--color-phosphor)]">🎁 已折抵用金 NT$ {b.creditUsed.toLocaleString()}</div>
            )}
          </div>
          {/* 右：申請退款 — v284：付款已被 admin 確認 (deposit_paid / fully_paid) 才顯示 */}
          {/*   排除：pending（沒付）/ awaiting_verify（上傳但未審）/ refunded / refunding */}
          {(b.paymentStatus === "fully_paid" || b.paymentStatus === "deposit_paid") && (
            <Link href={`/liff/refund-request/new?bookingId=${b.id}`}>
              <button className="inline-flex items-center gap-1 rounded-full border border-[var(--color-coral)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10 whitespace-nowrap">
                💸 申請退款
              </button>
            </Link>
          )}
        </div>

        {/* 我上傳的轉帳截圖 — 點縮圖放大 */}
        {b.paymentProofs.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-2">
            <div className="text-[11px] text-[var(--muted-foreground)] mb-1">
              我上傳的轉帳截圖（{b.paymentProofs.length} 張）
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {b.paymentProofs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    // v379：點開優先看大圖(R2)，沒有就退縮圖
                    const big = p.url ?? p.thumb;
                    if (big) setProofLightbox({
                      url: big,
                      caption: `${p.type === "deposit" ? "訂金" : p.type === "final" ? "尾款" : "退款"} NT$ ${p.amount.toLocaleString()}${p.verifiedAt ? " ✓已核可" : " ⏳待核可"}`,
                    });
                  }}
                  className="relative h-14 w-14 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                >
                  {(p.thumb ?? p.url) ? (
                    // v379：小圖一律用縮圖(DB)即時顯示，沒縮圖才用大圖 URL
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumb ?? p.url ?? ""}
                      alt={p.type}
                      className="h-full w-full object-cover hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted-foreground)]">
                      無預覽
                    </div>
                  )}
                  {p.verifiedAt && (
                    <div className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]">
                      <Check className="h-2.5 w-2.5" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 日潛結束後：今日照片 */}
        {showPhotoEntry && b.refId && (
          <div className="mt-3 border-t border-[var(--border)] pt-2">
            <button
              type="button"
              onClick={() => setShowPhotos(!showPhotos)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="text-xs font-semibold text-[var(--color-coral)]">
                📸 今日潛水照片（7 天有效期）
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {showPhotos ? "▲ 收起" : "▼ 展開"}
              </span>
            </button>
            {showPhotos && (
              <div className="mt-2">
                <TripPhotoGallery
                  tripId={b.refId}
                  canManage={false}
                  downloadable
                />
              </div>
            )}
          </div>
        )}

        {/* v293：同意聲明已搬到 Row 3，這裡移除避免重複 */}
        </>)}
      </CardContent>

      {/* Payment proof lightbox */}
      <Lightbox
        open={proofLightbox !== null}
        src={proofLightbox?.url ?? null}
        caption={proofLightbox?.caption}
        downloadable
        onClose={() => setProofLightbox(null)}
      />
    </Card>
  );
}

function gearLabel(itemType: GearItemType): string {
  const item = GEAR_OPTIONS_DEFAULT.find((g) => g.itemType === itemType);
  return item?.label ?? itemType;
}

// 簡單的折疊區塊（給編輯預約 Dialog 用）
function SectionCard({
  open,
  onToggle,
  title,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          {summary && (
            <div className="text-[10px] text-[var(--muted-foreground)] tabular">
              {summary}
            </div>
          )}
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-3">{children}</div>
      )}
    </div>
  );
}

// ─── Edit Dialog ────────────────────────────────────────
function EditBookingDialog({
  booking,
  gearOptions,
  onClose,
  onSaved,
}: {
  booking: MyBooking | null;
  gearOptions: GearOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const liff = useLiff();
  const [participants, setParticipants] = useState(1);
  const [tankCount, setTankCount] = useState(1);
  const [gearQty, setGearQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // 三個區塊預設都折疊
  const [openDive, setOpenDive] = useState(false);
  const [openGear, setOpenGear] = useState(false);
  const [openCompanions, setOpenCompanions] = useState(false);
  // 潛伴 slots (本人除外，所以陣列長度 = participants - 1)
  type CompanionSlot = {
    id?: string;
    name: string;
    phone: string;
    cert: "OW" | "AOW" | "Rescue" | "DM" | "Instructor" | null;
    certNumber: string;
    logCount: number;
    relationship: string;
  };
  const [companionSlots, setCompanionSlots] = useState<CompanionSlot[]>([]);
  // 從 user profile 拿的常用潛伴清單（給快速選用）
  const [savedCompanions, setSavedCompanions] = useState<CompanionSlot[]>([]);
  // 場次定價（為了預覽小計）
  const [tripPricing, setTripPricing] = useState<{
    baseTrip: number;
    extraTank: number;
    nightDive: number;
    scooterRental: number;
    tankCount: number;
    isNightDive: boolean;
    isScooter: boolean;
  } | null>(null);

  useEffect(() => {
    if (!booking) return;
    setParticipants(booking.participants);
    // 嘗試從 booking.rentalGear 反推目前 tankCount（無法直接得到，預設 trip.tankCount）
    setGearQty(
      booking.rentalGear.reduce<Record<string, number>>((acc, g) => {
        acc[g.itemType] = g.qty ?? 1;
        return acc;
      }, {}),
    );
    setNotes(booking.notes ?? "");
    setError(null);
    setCancelConfirm(false);
    setOpenDive(false);
    setOpenGear(false);
    setOpenCompanions(false);

    // 反推潛伴 slots (本人不算)
    const details = booking.participantDetails ?? [];
    const nonSelf = details.filter((d) => !d.isSelf);
    setCompanionSlots(
      nonSelf.map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        cert: d.cert,
        certNumber: d.certNumber,
        logCount: d.logCount,
        relationship: d.relationship,
      })),
    );

    // 抓 user 個人資料的常用潛伴
    liff
      .fetchWithAuth<{ companions: CompanionSlot[] }>("/api/me")
      .then((u) => setSavedCompanions(u.companions ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps

    // 若為日潛，撈場次定價（API 直接回 trip 欄位平鋪在 top level）
    if (booking.type === "daily" && booking.refId) {
      liff
        .fetchWithAuth<{
          pricing: {
            baseTrip: number;
            extraTank: number;
            nightDive: number;
            scooterRental: number;
          };
          tankCount: number;
          isNightDive: boolean;
          isScooter: boolean;
        }>(`/api/trips/${booking.refId}`)
        .then((r) => {
          setTripPricing({
            ...r.pricing,
            tankCount: r.tankCount,
            isNightDive: r.isNightDive,
            isScooter: r.isScooter,
          });
          // 先用 tripPricing.tankCount 預設；之後可能要從 booking 反推
          setTankCount(r.tankCount);
        })
        .catch(() => {});
    }
    // v249：見上方註解
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, liff.ready]);

  // 自動調整潛伴 slot 數量 = participants - 1 (本人不算)
  useEffect(() => {
    const need = Math.max(0, participants - 1);
    setCompanionSlots((prev) => {
      if (prev.length === need) return prev;
      if (prev.length < need) {
        // 補空 slot
        const empty: CompanionSlot = {
          name: "",
          phone: "",
          cert: null,
          certNumber: "",
          logCount: 0,
          relationship: "",
        };
        return [...prev, ...Array(need - prev.length).fill(empty)];
      }
      return prev.slice(0, need);
    });
  }, [participants]);

  if (!booking) return null;

  const isDaily = booking.type === "daily";
  const selectedGear = gearOptions.map((g) => ({
    ...g,
    qty: gearQty[g.itemType] ?? 0,
  })).filter((g) => g.qty > 0);

  async function save() {
    if (!booking) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        participants,
        notes: notes || null,
      };
      if (isDaily) {
        body.tankCount = tankCount;
        body.rentalGear = selectedGear.map((g) => ({
          itemType: g.itemType,
          price: g.price,
          qty: g.qty,
        }));
        // 多人預約：把本人 + 潛伴 slots 包成 participantDetails
        if (participants > 1) {
          body.participantDetails = [
            // 本人（從目前 booking.participantDetails 找出 isSelf 那個保留，不在就略過）
            ...((booking.participantDetails ?? []).filter((d) => d.isSelf)),
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
        } else {
          body.participantDetails = (booking.participantDetails ?? []).filter(
            (d) => d.isSelf,
          );
        }
      }
      await liff.fetchWithAuth(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!booking) return;
    setSubmitting(true);
    setError(null);
    try {
      await liff.fetchWithAuth(`/api/bookings/${booking.id}`, {
        method: "DELETE",
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDaily ? "修改預約日潛訂單" : "修改預約潛水團"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {/* ── Section 1: 潛水內容 (折疊) ── */}
          {isDaily ? (
            <SectionCard
              open={openDive}
              onToggle={() => setOpenDive((v) => !v)}
              title="潛水內容"
              summary={
                tripPricing
                  ? `${tankCount} 支 × ${participants} 人 · NT$ ${(tripPricing.extraTank * tankCount * participants).toLocaleString()}`
                  : `${participants} 人`
              }
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>潛水支數</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={tankCount <= 1}
                      onClick={() => setTankCount(Math.max(1, tankCount - 1))}
                    >
                      −
                    </Button>
                    <span className="w-10 text-center text-base font-bold tabular">
                      {tankCount} 支
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={
                        tripPricing
                          ? tankCount >= tripPricing.tankCount
                          : tankCount >= 4
                      }
                      onClick={() => setTankCount(tankCount + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label>人數</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={participants <= 1}
                      onClick={() =>
                        setParticipants(Math.max(1, participants - 1))
                      }
                    >
                      −
                    </Button>
                    <span className="w-10 text-center text-base font-bold tabular">
                      {participants} 人
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setParticipants(participants + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>

                {tripPricing && (
                  <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] tabular text-[var(--muted-foreground)]">
                    <div className="flex justify-between">
                      <span>
                        每支潛水 NT$ {tripPricing.extraTank.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-[var(--foreground)]">
                      <span>小計</span>
                      <span>
                        NT${" "}
                        {(
                          tripPricing.extraTank *
                          tankCount *
                          participants
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          ) : (
            // 潛水團不能改支數，只能改人數
            <div className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
              <Label>人數</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={participants <= 1}
                  onClick={() =>
                    setParticipants(Math.max(1, participants - 1))
                  }
                >
                  −
                </Button>
                <span className="w-10 text-center text-base font-bold tabular">
                  {participants}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setParticipants(participants + 1)}
                >
                  +
                </Button>
              </div>
            </div>
          )}

          {/* ── Section 1.5: 潛伴資料（人數 > 1 才顯示） ── */}
          {isDaily && participants > 1 && (
            <SectionCard
              open={openCompanions}
              onToggle={() => setOpenCompanions((v) => !v)}
              title={`潛伴資料 (${participants - 1} 位)`}
              summary={
                companionSlots.every(
                  (c) => c.name.trim().length >= 2 && c.cert !== null,
                )
                  ? companionSlots
                      .map((c) => `${c.name}${c.cert ? `(${c.cert})` : ""}`)
                      .join("、")
                  : `⚠ 還有 ${companionSlots.filter((c) => !c.name.trim() || c.cert === null).length} 位未填`
              }
            >
              <div className="space-y-2">
                {companionSlots.map((slot, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-[var(--border)] p-2"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold">潛伴 #{i + 2}</span>
                      {savedCompanions.length > 0 && (
                        <select
                          value={slot.id ?? ""}
                          onChange={(e) => {
                            const picked = savedCompanions.find(
                              (c) => c.id === e.target.value,
                            );
                            const next = picked
                              ? { ...picked }
                              : {
                                  name: "",
                                  phone: "",
                                  cert: null,
                                  certNumber: "",
                                  logCount: 0,
                                  relationship: "",
                                };
                            setCompanionSlots((arr) => {
                              const copy = [...arr];
                              copy[i] = next;
                              return copy;
                            });
                          }}
                          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-[10px] max-w-[8rem]"
                        >
                          <option value="">— 選潛伴 —</option>
                          {savedCompanions.map((c) => (
                            <option key={c.id} value={c.id ?? ""}>
                              {c.name}（{c.cert ?? "未填證照"}）
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        value={slot.name}
                        onChange={(e) =>
                          setCompanionSlots((arr) => {
                            const copy = [...arr];
                            copy[i] = { ...copy[i], name: e.target.value };
                            return copy;
                          })
                        }
                        placeholder="姓名 *"
                        className="text-xs"
                      />
                      <Input
                        type="tel"
                        inputMode="numeric"
                        maxLength={11}
                        value={slot.phone}
                        onChange={(e) =>
                          setCompanionSlots((arr) => {
                            const copy = [...arr];
                            copy[i] = {
                              ...copy[i],
                              phone: formatPhoneTW(e.target.value),
                            };
                            return copy;
                          })
                        }
                        placeholder="0912-345678"
                        className="text-xs"
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(["OW", "AOW", "DM", "Instructor"] as const).map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              setCompanionSlots((arr) => {
                                const copy = [...arr];
                                copy[i] = { ...copy[i], cert: c };
                                return copy;
                              })
                            }
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px]",
                              slot.cert === c
                                ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                                : "border-[var(--border)]",
                            )}
                          >
                            {c}
                          </button>
                        ),
                      )}
                    </div>
                    <Input
                      value={slot.relationship}
                      onChange={(e) =>
                        setCompanionSlots((arr) => {
                          const copy = [...arr];
                          copy[i] = { ...copy[i], relationship: e.target.value };
                          return copy;
                        })
                      }
                      placeholder="關係（朋友 / 同學 / 家人...）"
                      className="mt-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Section 2: 租賃裝備 (折疊) ── */}
          {isDaily && (
            <SectionCard
              open={openGear}
              onToggle={() => setOpenGear((v) => !v)}
              title="租賃裝備"
              summary={
                selectedGear.length === 0
                  ? "未選"
                  : `${selectedGear.length} 項 · NT$ ${selectedGear.reduce((s, g) => s + g.price * g.qty, 0).toLocaleString()}`
              }
            >
              <div className="space-y-1.5">
                {gearOptions.map((g) => {
                  const qty = gearQty[g.itemType] ?? 0;
                  const active = qty > 0;
                  return (
                    <div
                      key={g.itemType}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs",
                        active
                          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                          : "border-[var(--border)]",
                      )}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{g.label}</div>
                        <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                          +{g.price} / 件
                          {qty > 0 && (
                            <span className="ml-1 font-bold text-[var(--color-ocean-deep)]">
                              · NT$ {(g.price * qty).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() =>
                            setGearQty((s) => ({
                              ...s,
                              [g.itemType]: Math.max(0, (s[g.itemType] ?? 0) - 1),
                            }))
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-bold tabular">
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
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-phosphor)] bg-[var(--color-phosphor)] font-bold text-[var(--color-ocean-deep)]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* 備註 */}
          <div>
            <Label htmlFor="edit-notes">備註</Label>
            <Input
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="教練可見"
            />
          </div>

          {/* ── 總結費用 ── */}
          {isDaily && tripPricing && (
            <div className="rounded-md border-2 border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 p-2.5 text-xs tabular space-y-0.5">
              {tripPricing.baseTrip > 0 && (
                <div className="flex justify-between text-[var(--muted-foreground)]">
                  <span>基本費（整單）</span>
                  <span>NT$ {tripPricing.baseTrip.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>
                  潛水 {tripPricing.extraTank} × {tankCount} 支 × {participants} 人
                </span>
                <span>
                  NT${" "}
                  {(
                    tripPricing.extraTank *
                    tankCount *
                    participants
                  ).toLocaleString()}
                </span>
              </div>
              {/* v155：夜潛 / 水推附加列已移除（統一價） */}
              {selectedGear.length > 0 && (
                <div className="flex justify-between text-[var(--muted-foreground)]">
                  <span>裝備 ({selectedGear.length} 項)</span>
                  <span>
                    + NT${" "}
                    {selectedGear
                      .reduce((s, g) => s + g.price * g.qty, 0)
                      .toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-1 mt-1 font-bold">
                <span>總計</span>
                <span className="text-[var(--color-coral)] text-sm">
                  NT${" "}
                  {(
                    tripPricing.baseTrip +
                    tripPricing.extraTank * tankCount * participants +
                    selectedGear.reduce((s, g) => s + g.price * g.qty, 0)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-[var(--color-coral)]/15 p-2 text-xs text-[var(--color-coral)]">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!cancelConfirm ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setCancelConfirm(true)}
            >
              <XCircle className="h-4 w-4" />
              取消預約
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={submitting}
              onClick={cancel}
            >
              {submitting ? "..." : "確定取消"}
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            disabled={submitting}
            onClick={save}
          >
            {submitting ? "儲存中..." : "儲存修改"}
          </Button>
        </div>
        {cancelConfirm && (
          <p className="text-center text-[11px] text-[var(--color-coral)]">
            取消後依政策可能僅退部分金額（請參考預約時的取消政策）
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
