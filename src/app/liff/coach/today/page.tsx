"use client";
import { useEffect, useState } from "react";
import {
  Clock,
  Anchor,
  Moon,
  Phone,
  Award,
  AlertCircle,
  Check,
  X,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { DiverLoader } from "@/components/ui/DiverLoader";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ParticipantDetail {
  id?: string;
  name: string;
  phone: string;
  cert: string | null;
  certNumber: string;
  logCount: number;
  relationship: string;
  isSelf?: boolean;
}

interface CoachTripBooking {
  id: string;
  name: string;
  phone: string | null;
  cert: string | null;
  logCount: number;
  rentalGear: Array<{ itemType: string; price: number }>;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  notes: string | null;
  participants: number;
  participantDetails: ParticipantDetail[];
  status: string;
}

interface CoachTrip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  tankCount: number;
  capacity: number;
  status: string;
  sites: string[];
  bookings: CoachTripBooking[];
}

export default function CoachTodayPage() {
  const liff = useLiff();
  const [trips, setTrips] = useState<CoachTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  // v776：老闆(boss/admin/it)才可現場收現結清；教練/助教只標到場
  const [canRecordPayment, setCanRecordPayment] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const d = await liff.fetchWithAuth<{ trips: CoachTrip[]; viewerRoles?: string[] }>(
        "/api/coach/today",
      );
      setTrips(d.trips);
      setCanRecordPayment(
        (d.viewerRoles ?? []).some((r) => r === "boss" || r === "admin" || r === "it"),
      );
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // v249：deps 改用 liff.ready 避免 init 期間 4 次 setState 連環觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);

  // v755：先跳確認；未付清+到場→現場收現結清(現場付金)；已付+缺席→提醒走退款
  async function markAttendance(
    b: CoachTripBooking,
    action: "completed" | "no_show",
  ) {
    const owed = Math.max(0, (b.totalAmount ?? 0) - (b.paidAmount ?? 0));
    const paid = b.paidAmount ?? 0;
    // v776：老闆可現場收現結清（收現→標到場，一次同步 paidAmount/paymentStatus/paymentMethod/status）；
    //   教練/助教不能記帳(v756) → 未付清只標到場 + 提醒通知老闆收款。
    const settle = action === "completed" && owed > 0 && canRecordPayment;
    if (action === "completed") {
      const ok = owed > 0
        ? (canRecordPayment
            ? confirm(`⚠️ ${b.name} 尚未付清，剩餘 NT$${owed.toLocaleString()}。\n\n按「確定」＝現場收現 NT$${owed.toLocaleString()}（現場付金）並標記到場。\n若未收到現金請按「取消」。`)
            : confirm(`⚠️ ${b.name} 尚未付清，剩餘 NT$${owed.toLocaleString()}。\n\n請現場向客戶收現金，並通知老闆記帳。\n確認標記到場？`))
        : confirm(`確認 ${b.name} 到場？`);
      if (!ok) return;
    } else {
      const ok = paid > 0
        ? confirm(`⚠️ ${b.name} 已付 NT$${paid.toLocaleString()}。\n標記「缺席」後，請通知老闆處理退款。\n\n確認標記缺席？`)
        : confirm(`確認 ${b.name} 缺席？`);
      if (!ok) return;
    }
    setUpdating(b.id);
    try {
      // 老闆現場收現：先記一筆「現金（實收）= 剩餘」＝現場付金（會一併標 paymentMethod=cash），再標到場
      if (settle) {
        await liff.fetchWithAuth(`/api/admin/bookings/${b.id}/payment-entry`, {
          method: "POST",
          body: JSON.stringify({ kind: "cash", amount: owed }),
        });
      }
      await liff.fetchWithAuth(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await reload();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUpdating(null);
    }
  }

  const totalUnpaid = trips.reduce(
    (s, t) =>
      s +
      t.bookings.reduce(
        (ss, b) => ss + Math.max(0, b.totalAmount - b.paidAmount),
        0,
      ),
    0,
  );

  return (
    <LiffShell title="今日場次" backHref="/liff/welcome">
      <div className="px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">
            {err}
            <div className="mt-2 text-xs text-[var(--muted-foreground)]">
              提示：請先在資料庫把帳號 role 設成 coach。
            </div>
          </Card>
        )}

        {!err && (
          <Card className="mb-3 bg-[var(--color-ocean-deep)] text-white">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs opacity-70">今日總計</div>
                <div className="text-2xl font-bold tabular">
                  {trips.length} 場次 ·{" "}
                  {trips.reduce((s, t) => s + t.bookings.length, 0)} 人
                </div>
              </div>
              {totalUnpaid > 0 && (
                <Badge variant="gold" className="tabular">
                  未收 NT$ {totalUnpaid.toLocaleString()}
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        {/* v779：老闆專用 — 進「老闆結帳・待收款」處理過期/現場付款/已到場未付清（不限今天）*/}
        {!err && canRecordPayment && (
          <Link href="/liff/coach/settle" className="mb-3 block">
            <Card className="flex items-center justify-between p-3 text-sm">
              <span className="font-semibold">💵 老闆結帳・待收款</span>
              <span className="text-[var(--color-ocean-deep)]">處理過期/未收款 →</span>
            </Card>
          </Link>
        )}

        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <DiverLoader label="載入中…" size={96} />
            </div>
          )}
          {!loading && trips.length === 0 && !err && (
            <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              今日沒有場次
            </Card>
          )}
          {trips.map((t) => (
            <Card
              key={t.id}
              className={t.isNightDive ? "bg-[var(--color-midnight)] text-white" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <CardTitle
                      className={cn(
                        "text-lg tabular",
                        t.isNightDive && "text-white",
                      )}
                    >
                      {t.startTime}
                    </CardTitle>
                    {t.isNightDive && (
                      <Badge variant="ocean" className="gap-1">
                        <Moon className="h-3 w-3" /> 夜
                      </Badge>
                    )}
                  </div>
                  <div className="tabular text-sm">
                    {t.bookings.reduce((s, b) => s + 1, 0)}/{t.capacity}
                  </div>
                </div>
                <div
                  className={cn(
                    "mt-1 flex items-center gap-1 text-xs",
                    t.isNightDive ? "opacity-70" : "text-[var(--muted-foreground)]",
                  )}
                >
                  <Anchor className="h-3 w-3" />
                  {t.sites.join(" · ")}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {t.bookings.map((b) => {
                  const unpaid = Math.max(0, b.totalAmount - b.paidAmount);
                  const companions = (b.participantDetails ?? []).filter(
                    (p) => !p.isSelf,
                  );
                  const isDone = b.status === "completed";
                  const isNoShow = b.status === "no_show";
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "rounded-lg border p-2 space-y-1.5",
                        isDone
                          ? "border-[var(--color-phosphor)]/50 bg-[var(--color-phosphor)]/10"
                          : isNoShow
                            ? "border-[var(--color-coral)]/50 bg-[var(--color-coral)]/10 opacity-60"
                            : t.isNightDive
                              ? "border-white/15 bg-white/5"
                              : "border-[var(--border)] bg-white",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 flex-shrink-0">
                          <AvatarFallback className="text-xs">
                            {b.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-sm font-bold flex-wrap">
                            {b.name}
                            {b.cert && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
                                <Award className="h-2.5 w-2.5" />
                                {b.cert}
                              </span>
                            )}
                            {b.participants > 1 && (
                              <Badge variant="muted" className="gap-0.5 text-[10px]">
                                <Users className="h-2.5 w-2.5" />
                                {b.participants} 人
                              </Badge>
                            )}
                            {isDone && (
                              <Badge variant="default" className="text-[10px]">
                                ✓ 已到場
                              </Badge>
                            )}
                            {isNoShow && (
                              <Badge variant="coral" className="text-[10px]">
                                ✗ 缺席
                              </Badge>
                            )}
                          </div>
                          <div className="tabular text-xs opacity-70">
                            {b.phone ?? "—"} · {b.logCount} logs
                          </div>
                          {b.notes && (
                            <div className="mt-1 flex items-start gap-1 rounded bg-[var(--color-coral)]/15 px-1.5 py-0.5 text-[11px] text-[var(--color-coral)]">
                              <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              {b.notes}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          {unpaid > 0 ? (
                            <Badge variant="gold" className="tabular">
                              未收 {unpaid.toLocaleString()}
                            </Badge>
                          ) : (
                            <Badge variant="default">已收</Badge>
                          )}
                          {b.phone && (
                            <a
                              href={`tel:${b.phone}`}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] underline"
                            >
                              <Phone className="h-3 w-3" /> 打給
                            </a>
                          )}
                        </div>
                      </div>

                      {/* 潛伴清單 (多人預約) */}
                      {companions.length > 0 && (
                        <div className="ml-12 space-y-0.5">
                          {companions.map((c, ci) => (
                            <div
                              key={ci}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px]",
                                t.isNightDive
                                  ? "bg-white/10"
                                  : "bg-[var(--muted)]/50",
                              )}
                            >
                              <span className="font-semibold">{c.name}</span>
                              {c.cert && (
                                <span className="ml-1 text-[10px] opacity-70">
                                  ({c.cert})
                                </span>
                              )}
                              {c.relationship && (
                                <span className="ml-1 text-[10px] opacity-60">
                                  · {c.relationship}
                                </span>
                              )}
                              {c.phone && (
                                <span className="ml-1 tabular text-[10px] opacity-60">
                                  · {c.phone}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 到場 / 缺席 按鈕 */}
                      {!isDone && !isNoShow && (
                        <div className="flex gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updating === b.id}
                            onClick={() => markAttendance(b, "completed")}
                            className="flex-1 border-[var(--color-phosphor)] text-[var(--color-phosphor)]"
                          >
                            <Check className="h-3 w-3" />
                            到場
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updating === b.id}
                            onClick={() => markAttendance(b, "no_show")}
                            className="flex-1 border-[var(--color-coral)] text-[var(--color-coral)]"
                          >
                            <X className="h-3 w-3" />
                            缺席
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-4 rounded-lg bg-[var(--muted)]/40 p-3 text-center text-[11px] text-[var(--muted-foreground)]">
          收款核對由老闆 / admin 處理（教練不碰款項）
        </div>
      </div>
    </LiffShell>
  );
}
