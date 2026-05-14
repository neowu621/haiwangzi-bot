"use client";
import { use, useEffect, useMemo, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { formatPhoneTW } from "@/lib/phone";
import { cn } from "@/lib/utils";

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
  capacity: number;
  booked: number;
  available: number;
  includes: string[];
  excludes: string[];
  addons: Array<{ id: string; label: string; priceDelta: number }>;
  sites: Array<{ id: string; name: string; description: string }>;
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
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");
  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    liff
      .fetchWithAuth<TourDetail>(`/api/tours/${packageId}`)
      .then(setTour)
      .catch((e) => setError(e.message));
  }, [packageId, liff]);

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
    agreed &&
    realName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 8;

  async function submit() {
    if (!tour || !canSubmit) return;
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
          agreedToTerms: true as const,
          realName,
          phone,
          certNumber: certNumber || undefined,
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
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          {error ? `錯誤：${error}` : "載入中..."}
        </div>
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
            <div>
              <Label htmlFor="cert">證照編號 (選填)</Label>
              <Input
                id="cert"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="如: PADI 12345678"
              />
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
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="備註 (飲食 / 房型偏好 / 同行者)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2 rounded-lg bg-[var(--muted)] p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--color-coral)]" />
              <div>
                <p className="font-bold">繳款 & 取消政策</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 opacity-90">
                  <li>預約後請於 7 日內繳訂金 NT$ {tour.deposit.toLocaleString()}/人</li>
                  <li>尾款於出發前 14 日繳清</li>
                  <li>出發前 30 日取消：扣訂金 50%</li>
                  <li>出發前 14 日內取消：訂金不退、扣尾款 50%</li>
                  <li>因不可抗力 (氣候/疫情) 取消：全額退費或改期</li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAgreed(!agreed)}
              className={cn(
                "mt-3 flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-sm",
                agreed
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/10"
                  : "border-dashed border-[var(--border)]",
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2",
                  agreed
                    ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]"
                    : "border-[var(--muted-foreground)]",
                )}
              >
                {agreed && (
                  <Check className="h-3 w-3 text-[var(--color-ocean-deep)]" />
                )}
              </div>
              <span className="font-medium">我已閱讀並同意繳款 & 取消政策</span>
            </button>
          </CardContent>
        </Card>

        <Card className="sticky bottom-4 z-10">
          <CardContent className="p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  總金額
                </div>
                <div className="text-2xl font-bold tabular text-[var(--color-coral)]">
                  NT$ {total.toLocaleString()}
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted-foreground)] tabular">
                  訂金 NT$ {depositTotal.toLocaleString()}
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
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg bg-[var(--color-coral)]/15 p-3 text-sm text-[var(--color-coral)]">
            {error}
          </div>
        )}
      </div>
    </LiffShell>
  );
}
