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
import { BottomNav } from "@/components/shell/BottomNav";
import { Lightbox } from "@/components/ui/lightbox";
import { TripPhotoGallery } from "@/components/admin/TripPhotoGallery";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

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
    | "confirmed"
    | "cancelled_by_user"
    | "cancelled_by_weather"
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
  participants: number;
  rentalGear: RentalGear[];
  notes: string | null;
  ref:
    | { date: string; startTime: string; sites: string[] }
    | { title: string; dateStart: string; dateEnd: string; sites: string[] }
    | null;
  paymentProofs: Array<{
    id: string;
    type: "deposit" | "final" | "refund";
    amount: number;
    verifiedAt: string | null;
    url: string | null;
    uploadedAt: string;
  }>;
  // 後端：daily booking 額外加 refId 給 photo gallery 用（daily only）
  refId?: string;
  createdAt: string;
}

const STATUS_LABEL: Record<MyBooking["status"], string> = {
  pending: "待確認",
  confirmed: "已確認",
  cancelled_by_user: "已取消",
  cancelled_by_weather: "天候取消",
  completed: "已完成",
  no_show: "未到",
};

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

function isUpcoming(b: MyBooking) {
  if (
    b.status === "cancelled_by_user" ||
    b.status === "cancelled_by_weather" ||
    b.status === "completed" ||
    b.status === "no_show"
  )
    return false;
  if (!b.ref) return false;
  const d = "date" in b.ref ? b.ref.date : b.ref.dateStart;
  return new Date(d) >= new Date(new Date().toDateString());
}

function isEditable(b: MyBooking) {
  return (
    isUpcoming(b) &&
    b.paymentStatus !== "fully_paid" &&
    b.paymentStatus !== "refunding" &&
    b.paymentStatus !== "refunded"
  );
}

export default function MyBookingsPage() {
  const liff = useLiff();
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MyBooking | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    liff
      .fetchWithAuth<{ bookings: MyBooking[] }>("/api/bookings/my")
      .then((d) => setBookings(d.bookings))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [liff]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const up: MyBooking[] = [];
    const done: MyBooking[] = [];
    const cancelled: MyBooking[] = [];
    for (const b of bookings) {
      if (b.status === "cancelled_by_user" || b.status === "cancelled_by_weather") {
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

  return (
    <LiffShell title="我的預約" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <div className="px-4 pt-4">
        <Tabs defaultValue="up" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="up">
              即將前往 ({grouped.up.length})
            </TabsTrigger>
            <TabsTrigger value="done">
              已完成 ({grouped.done.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              已取消 ({grouped.cancelled.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="up" className="space-y-3">
            {loading && (
              <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
                載入中...
              </div>
            )}
            {!loading && grouped.up.length === 0 && <EmptyState />}
            {grouped.up.map((b) => (
              <BookingCard key={b.id} b={b} onEdit={() => setEditing(b)} />
            ))}
          </TabsContent>
          <TabsContent value="done" className="space-y-3">
            {grouped.done.length === 0 && <EmptyState text="還沒有完成紀錄" />}
            {grouped.done.map((b) => (
              <BookingCard key={b.id} b={b} onEdit={() => setEditing(b)} />
            ))}
          </TabsContent>
          <TabsContent value="cancelled" className="space-y-3">
            {grouped.cancelled.length === 0 && (
              <EmptyState text="沒有已取消的訂單" />
            )}
            {grouped.cancelled.map((b) => (
              <BookingCard key={b.id} b={b} onEdit={() => setEditing(b)} />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <EditBookingDialog
        booking={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </LiffShell>
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
  onEdit,
}: {
  b: MyBooking;
  onEdit: () => void;
}) {
  const isDaily = b.type === "daily";
  const ref = b.ref;
  const needsPayment =
    b.paymentStatus !== "fully_paid" &&
    b.paymentStatus !== "refunded" &&
    b.totalAmount > 0;
  const progress =
    b.totalAmount > 0
      ? Math.min(100, Math.round((b.paidAmount / b.totalAmount) * 100))
      : 0;
  const editable = isEditable(b);
  const [proofLightbox, setProofLightbox] = useState<{
    url: string;
    caption?: string;
  } | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  // 日潛已結束（completed 或日期過了）→ 顯示「今日照片」入口
  const showPhotoEntry =
    isDaily &&
    b.refId &&
    (b.status === "completed" ||
      (ref && "date" in ref && ref.date < new Date().toISOString().slice(0, 10)));

  return (
    <Card className={cn(b.type === "tour" && "border-l-4 border-l-[var(--color-coral)]")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {isDaily ? (
              <CalendarDays className="h-4 w-4" />
            ) : (
              <Plane className="h-4 w-4" />
            )}
            <span className="text-sm font-bold">
              {isDaily ? "日潛" : "旅遊潛水"}
            </span>
            <Badge variant="muted" className="text-[10px]">
              ×{b.participants} 人
            </Badge>
          </div>
          <Badge
            variant={
              b.status === "confirmed"
                ? "default"
                : b.status === "completed"
                ? "muted"
                : b.status.startsWith("cancelled")
                ? "coral"
                : "gold"
            }
          >
            {STATUS_LABEL[b.status]}
          </Badge>
        </div>

        {ref && "date" in ref && (
          <>
            <div className="mt-2 text-xl font-bold tabular">
              {ref.date} {ref.startTime}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <MapPin className="h-3 w-3" />
              {ref.sites.join(" · ")}
            </div>
          </>
        )}
        {ref && "title" in ref && (
          <>
            <div className="mt-2 text-lg font-bold leading-tight">
              {ref.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)] tabular">
              <CalendarDays className="h-3 w-3" />
              {ref.dateStart} → {ref.dateEnd}
            </div>
          </>
        )}

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

        {b.type === "tour" && b.totalAmount > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">付款進度</span>
              <span className="tabular font-semibold">
                {b.paidAmount.toLocaleString()} / {b.totalAmount.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full bg-[var(--color-phosphor)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex gap-1">
              {[
                { label: "預約", done: true },
                { label: "訂金", done: b.paidAmount >= b.depositAmount },
                { label: "尾款", done: b.paymentStatus === "fully_paid" },
                { label: "出發", done: b.status === "completed" },
              ].map((s, i) => (
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
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
          <div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {isDaily ? "現場收費" : "總金額"}
            </div>
            <div className="text-base font-bold tabular text-[var(--color-coral)]">
              NT$ {b.totalAmount.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {editable && (
              <Button
                size="sm"
                variant="outline"
                onClick={onEdit}
                className="h-8 gap-1 px-2.5 text-xs"
              >
                <Edit3 className="h-3 w-3" />
                修改
              </Button>
            )}
            {needsPayment && (
              <Link href={`/liff/payment/${b.id}`}>
                <button className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gold)] px-3 py-1.5 text-xs font-bold text-[var(--color-ocean-deep)]">
                  <Upload className="h-3 w-3" />
                  {b.type === "daily" ? "付款確認" : "上傳付款"}
                </button>
              </Link>
            )}
          </div>
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
                  onClick={() =>
                    p.url &&
                    setProofLightbox({
                      url: p.url,
                      caption: `${p.type === "deposit" ? "訂金" : p.type === "final" ? "尾款" : "退款"} NT$ ${p.amount.toLocaleString()}${p.verifiedAt ? " ✓已核可" : " ⏳待核可"}`,
                    })
                  }
                  className="relative h-14 w-14 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                >
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
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
  const item = GEAR_OPTIONS.find((g) => g.itemType === itemType);
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
  onClose,
  onSaved,
}: {
  booking: MyBooking | null;
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
  // 兩個區塊預設都折疊
  const [openDive, setOpenDive] = useState(false);
  const [openGear, setOpenGear] = useState(false);
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
  }, [booking, liff]);

  if (!booking) return null;

  const isDaily = booking.type === "daily";
  const selectedGear = GEAR_OPTIONS.map((g) => ({
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
          <DialogTitle>修改預約</DialogTitle>
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
                {GEAR_OPTIONS.map((g) => {
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
              {tripPricing.isNightDive && (
                <div className="flex justify-between text-[var(--muted-foreground)]">
                  <span>· 夜潛</span>
                  <span>+ NT$ {tripPricing.nightDive.toLocaleString()}</span>
                </div>
              )}
              {tripPricing.isScooter && (
                <div className="flex justify-between text-[var(--muted-foreground)]">
                  <span>· 水推</span>
                  <span>+ NT$ {tripPricing.scooterRental.toLocaleString()}</span>
                </div>
              )}
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
                    (tripPricing.isNightDive ? tripPricing.nightDive : 0) +
                    (tripPricing.isScooter ? tripPricing.scooterRental : 0) +
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
