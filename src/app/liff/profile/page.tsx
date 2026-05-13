"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Edit3,
  Phone,
  Award,
  Plus,
  Trash2,
  Check,
  X,
  Anchor,
  Calendar,
  ChevronUp,
  Settings,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface Companion {
  id: string;
  name: string;
  phone: string;
  cert: "OW" | "AOW" | "Rescue" | "DM" | "Instructor" | null;
  certNumber: string;
  logCount: number;
  relationship: string;
}

interface BookingHistoryItem {
  id: string;
  type: "daily" | "tour";
  status: string;
  paymentStatus: string;
  totalAmount: number;
  participants: number;
  createdAt: string;
  ref: {
    date?: string;
    dateStart?: string;
    dateEnd?: string;
    startTime?: string;
    title?: string;
    sites?: string[];
  };
}

interface Me {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  cert: "OW" | "AOW" | "Rescue" | "DM" | "Instructor" | null;
  certNumber: string | null;
  logCount: number;
  role: string;
  notes: string | null;
  emergencyContact: { name: string; phone: string; relationship: string } | null;
  companions: Companion[];
  stats: { totalBookings: number; completed: number };
}

const CERTS = ["OW", "AOW", "Rescue", "DM", "Instructor"] as const;

export default function ProfilePage() {
  const liff = useLiff();
  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 本人資料
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [cert, setCert] = useState<(typeof CERTS)[number] | "">("");
  const [certNumber, setCertNumber] = useState("");
  const [logCount, setLogCount] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");
  const [notes, setNotes] = useState("");

  // 同伴
  const [companions, setCompanions] = useState<Companion[]>([]);

  // 折疊狀態
  const [personalOpen, setPersonalOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [companionsOpen, setCompanionsOpen] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState(false);

  // 統計卡的點擊 dialog
  const [statsDialog, setStatsDialog] = useState<
    null | "bookings" | "completed"
  >(null);
  const [bookingHistory, setBookingHistory] = useState<BookingHistoryItem[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);

  async function openBookingDialog(filter: "bookings" | "completed") {
    setStatsDialog(filter);
    if (bookingHistory.length === 0) {
      setBookingLoading(true);
      try {
        const res = await liff.fetchWithAuth<{ bookings: BookingHistoryItem[] }>(
          "/api/bookings/my",
        );
        setBookingHistory(res.bookings || []);
      } finally {
        setBookingLoading(false);
      }
    }
  }

  // 必填驗證
  const personalComplete =
    realName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    cert !== "";
  const emergencyComplete =
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 8 &&
    emergencyRel.trim().length >= 1;

  function reloadMe() {
    return liff
      .fetchWithAuth<Me>("/api/me")
      .then((u) => {
        setMe(u);
        setRealName(u.realName ?? "");
        setPhone(u.phone ?? "");
        setCert(u.cert ?? "");
        setCertNumber(u.certNumber ?? "");
        setLogCount(String(u.logCount ?? 0));
        setEmergencyName(u.emergencyContact?.name ?? "");
        setEmergencyPhone(u.emergencyContact?.phone ?? "");
        setEmergencyRel(u.emergencyContact?.relationship ?? "");
        setNotes(u.notes ?? "");
        setCompanions(u.companions ?? []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    reloadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  // 載完後自動展開未填齊全的卡
  useEffect(() => {
    if (!me || autoExpanded) return;
    if (!personalComplete) setPersonalOpen(true);
    if (!emergencyComplete) setEmergencyOpen(true);
    setAutoExpanded(true);
  }, [me, personalComplete, emergencyComplete, autoExpanded]);

  // 自動儲存個人資料（debounce 600ms）
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => {
      saveSelf();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    realName,
    phone,
    cert,
    certNumber,
    logCount,
    notes,
    emergencyName,
    emergencyPhone,
    emergencyRel,
  ]);

  async function saveSelf() {
    if (!me) return;
    setSaving(true);
    try {
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          realName: realName || null,
          phone: phone || null,
          cert: cert || null,
          certNumber: certNumber || null,
          logCount: Number(logCount) || 0,
          notes: notes || null,
          emergencyContact:
            emergencyName && emergencyPhone
              ? {
                  name: emergencyName,
                  phone: emergencyPhone,
                  relationship: emergencyRel || "其他",
                }
              : null,
        }),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function persistCompanions(next: Companion[]) {
    // 取消任何 pending debounce 寫入，避免覆寫掉這次的明確操作
    if (saveCompTimer) {
      clearTimeout(saveCompTimer);
      saveCompTimer = undefined;
    }
    // 樂觀更新：UI 立即響應
    setCompanions(next);
    try {
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ companions: next }),
      });
      setSavedAt(Date.now());
    } catch (err) {
      // 失敗時回滾並顯示錯誤
      console.error("[persistCompanions]", err);
      alert(
        "儲存失敗：" + (err instanceof Error ? err.message : String(err)),
      );
      // 重新從伺服器拉回，避免狀態不一致
      reloadMe();
    }
  }

  function addCompanion() {
    const c: Companion = {
      id: crypto.randomUUID(),
      name: "",
      phone: "",
      cert: null,
      certNumber: "",
      logCount: 0,
      relationship: "",
    };
    // 不立即 PATCH（避免送一個空白同伴到後端）；等使用者開始填寫才會 debounce 儲存
    setCompanions([...companions, c]);
    setCompanionsOpen(true);
  }

  function updateCompanion(id: string, patch: Partial<Companion>) {
    setCompanions((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      // 防抖儲存（用最新 next，避免閉包陳舊）
      if (saveCompTimer) clearTimeout(saveCompTimer);
      saveCompTimer = setTimeout(() => {
        persistCompanions(next);
      }, 600);
      return next;
    });
  }

  async function removeCompanion(id: string) {
    if (!confirm("確定刪除這位同伴？")) return;
    // 用 functional update 拿最新陣列再過濾，避免陳舊閉包
    let next: Companion[] = [];
    setCompanions((prev) => {
      next = prev.filter((c) => c.id !== id);
      return next;
    });
    // 等 React commit 後再 PATCH
    await new Promise((r) => setTimeout(r, 0));
    await persistCompanions(next);
  }

  const completedCompanions = useMemo(
    () =>
      companions.filter(
        (c) => c.name.trim().length >= 2 && c.cert !== null,
      ),
    [companions],
  );

  if (!me) {
    return (
      <LiffShell title="個人資料" backHref="/liff/welcome" bottomNav={<BottomNav />}>
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          載入中...
        </div>
      </LiffShell>
    );
  }

  return (
    <LiffShell
      title="個人資料"
      backHref="/liff/welcome"
      bottomNav={<BottomNav />}
      rightSlot={
        saving ? (
          <span className="text-[11px] text-[var(--muted-foreground)]">儲存中...</span>
        ) : savedAt ? (
          <span className="text-[11px] font-semibold text-[var(--color-phosphor)]">
            ✓ 已儲存
          </span>
        ) : null
      }
    >
      <div className="space-y-3 px-4 pt-3">
        {/* 顯示卡（不可摺疊）*/}
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={liff.profile?.pictureUrl} />
              <AvatarFallback>
                {(me.realName || me.displayName).slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="text-base font-bold">
                {me.realName || me.displayName}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted-foreground)] tabular">
                <span>ID: {me.lineUserId.slice(0, 10)}...</span>
                {me.role !== "customer" && (
                  <Badge variant="ocean">{me.role}</Badge>
                )}
              </div>
            </div>
          </CardContent>
          <Separator />
          <CardContent className="grid grid-cols-3 gap-2 p-3 text-center">
            <div className="rounded-lg px-1 py-1">
              <div className="text-xl font-bold tabular text-[var(--color-phosphor)]">
                {me.logCount}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                潛水次數
              </div>
            </div>
            <button
              type="button"
              onClick={() => openBookingDialog("bookings")}
              className={cn(
                "rounded-lg px-1 py-1 transition-colors active:scale-[0.97]",
                me.stats.totalBookings > 0 &&
                  "hover:bg-[var(--muted)] cursor-pointer",
              )}
              disabled={me.stats.totalBookings === 0}
            >
              <div className="text-xl font-bold tabular">
                {me.stats.totalBookings}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                預約紀錄{me.stats.totalBookings > 0 && " ▸"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => openBookingDialog("completed")}
              className={cn(
                "rounded-lg px-1 py-1 transition-colors active:scale-[0.97]",
                me.stats.completed > 0 &&
                  "hover:bg-[var(--muted)] cursor-pointer",
              )}
              disabled={me.stats.completed === 0}
            >
              <div className="text-xl font-bold tabular text-[var(--color-coral)]">
                {me.stats.completed}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                已完成{me.stats.completed > 0 && " ▸"}
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Admin / Coach 角色才看到的後台入口 */}
        {(me.role === "admin" || me.role === "coach") && (
          <Link
            href={
              me.role === "admin"
                ? "/liff/admin/dashboard"
                : "/liff/coach/today"
            }
          >
            <Card className="border-2 border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 transition-colors hover:bg-[var(--color-phosphor)]/10">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold">
                    {me.role === "admin" ? "Admin 主控台" : "教練後台"}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {me.role === "admin"
                      ? "開團 / 訂單 / 會員 / 訊息模板 / 群發推播"
                      : "今日場次 / 收款核對 / 本期排班"}
                  </div>
                </div>
                <span className="text-[var(--color-ocean-deep)]">▸</span>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* 個人資料（含證照、聯絡）— Collapsible，必填 */}
        <CollapsibleCard
          title="個人資料"
          required
          complete={personalComplete}
          open={personalOpen}
          onToggle={() => setPersonalOpen(!personalOpen)}
          summary={
            personalComplete
              ? `${realName}・${phone}・${cert}${logCount ? `・${logCount}支` : ""}`
              : "尚未填寫（預約時會強制填寫）"
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>姓名 *</Label>
                <Input
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="本名"
                />
              </div>
              <div>
                <Label>手機 *</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xx-xxx-xxx"
                />
              </div>
            </div>
            <div>
              <Label>
                <Award className="mr-1 inline h-3.5 w-3.5" />
                證照等級 *
              </Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {CERTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCert(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      cert === c
                        ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                        : "border-[var(--border)]",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>證照編號</Label>
                <Input
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  placeholder="例: TW-AOW-12345"
                />
              </div>
              <div>
                <Label>累計潛水支數</Label>
                <Input
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
              <Label>
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                備註 (教練可見)
              </Label>
              <textarea
                className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--input)] bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="耳壓平衡 / 過敏 / 慢性病 / 用藥..."
              />
            </div>
          </div>
        </CollapsibleCard>

        {/* 緊急聯絡人 — Collapsible，必填 */}
        <CollapsibleCard
          title="緊急聯絡人"
          required
          complete={emergencyComplete}
          open={emergencyOpen}
          onToggle={() => setEmergencyOpen(!emergencyOpen)}
          summary={
            emergencyComplete
              ? `${emergencyName}・${emergencyRel}・${emergencyPhone}`
              : "尚未填寫（預約時會強制填寫）"
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

        {/* 常用同伴 — Collapsible */}
        <CollapsibleCard
          title="常用同伴"
          complete={completedCompanions.length > 0}
          open={companionsOpen}
          onToggle={() => setCompanionsOpen(!companionsOpen)}
          rightHint={
            companions.length > 0 ? (
              <span>· {companions.length} 位</span>
            ) : null
          }
          summary={
            companions.length === 0
              ? "尚未新增同伴（預約時可一鍵帶入）"
              : companions
                  .filter((c) => c.name.trim())
                  .map((c) => c.name)
                  .join("、") || "尚未填寫"
          }
        >
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              預先把常一起下水的朋友資料填好，下次多人預約直接挑選。
              預約時新填的同伴也會自動加進這裡。
            </p>
            {companions.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
                還沒有同伴，點下方「新增同伴」開始
              </div>
            )}
            {companions.map((c, idx) => (
              <InlineCompanionEditor
                key={c.id}
                idx={idx + 1}
                companion={c}
                onChange={(patch) => updateCompanion(c.id, patch)}
                onRemove={() => removeCompanion(c.id)}
              />
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={addCompanion}
            >
              <Plus className="h-4 w-4" />
              新增同伴 #{companions.length + 1}
            </Button>
          </div>
        </CollapsibleCard>
      </div>

      {/* 預約紀錄 / 已完成 點擊跳出 Dialog */}
      <Dialog
        open={statsDialog !== null}
        onOpenChange={(o) => !o && setStatsDialog(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {statsDialog === "completed" ? "已完成紀錄" : "預約紀錄"}
            </DialogTitle>
          </DialogHeader>
          {bookingLoading ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              載入中...
            </div>
          ) : (
            <BookingHistoryList
              bookings={bookingHistory}
              filter={statsDialog}
              onClose={() => setStatsDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </LiffShell>
  );
}

function statusLabel(status: string): { text: string; tone: "ok" | "warn" | "muted" } {
  switch (status) {
    case "pending":
      return { text: "待確認", tone: "warn" };
    case "confirmed":
      return { text: "已確認", tone: "ok" };
    case "completed":
      return { text: "已完成", tone: "ok" };
    case "cancelled_by_user":
      return { text: "已取消", tone: "muted" };
    case "cancelled_by_weather":
      return { text: "天氣取消", tone: "muted" };
    case "no_show":
      return { text: "未到", tone: "warn" };
    default:
      return { text: status, tone: "muted" };
  }
}

function BookingHistoryList({
  bookings,
  filter,
  onClose,
}: {
  bookings: BookingHistoryItem[];
  filter: "bookings" | "completed" | null;
  onClose: () => void;
}) {
  const filtered = useMemo(() => {
    if (filter === "completed") {
      return bookings.filter((b) => b.status === "completed");
    }
    return bookings;
  }, [bookings, filter]);

  if (filtered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        {filter === "completed"
          ? "尚未完成任何潛水紀錄"
          : "尚無預約紀錄"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((b) => {
        const date = b.ref.date || b.ref.dateStart || "—";
        const title =
          b.type === "tour"
            ? b.ref.title || "旅行團"
            : (b.ref.sites?.[0] ?? "東北角");
        const sub =
          b.type === "tour"
            ? `${b.ref.dateStart?.slice(5)} → ${b.ref.dateEnd?.slice(5)}`
            : `${b.ref.startTime ?? ""} · ${b.participants} 人`;
        const status = statusLabel(b.status);
        return (
          <Link
            key={b.id}
            href={`/liff/my?just=${b.id}`}
            onClick={onClose}
            className="block rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--muted)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {b.type === "tour" ? (
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-coral)]" />
                  ) : (
                    <Anchor className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-phosphor)]" />
                  )}
                  <span className="truncate text-sm font-bold">{title}</span>
                </div>
                <div className="mt-1 text-[11px] tabular text-[var(--muted-foreground)]">
                  {date} · {sub}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant={
                    status.tone === "ok"
                      ? "default"
                      : status.tone === "warn"
                      ? "coral"
                      : "muted"
                  }
                  className="text-[10px]"
                >
                  {status.text}
                </Badge>
                <span className="text-[11px] tabular font-semibold text-[var(--color-coral)]">
                  NT$ {b.totalAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// 模組級 timer，跨 render 持有
let saveCompTimer: NodeJS.Timeout | undefined;

/**
 * 同伴 #N 的「永遠展開」inline editor。
 * 預約時用同一個版面，使用者一打開常用同伴就能直接填寫。
 */
function InlineCompanionEditor({
  idx,
  companion,
  onChange,
  onRemove,
}: {
  idx: number;
  companion: Companion;
  onChange: (patch: Partial<Companion>) => void;
  onRemove: () => void;
}) {
  const complete = companion.name.trim().length >= 2 && companion.cert !== null;
  const [open, setOpen] = useState(!complete);
  useEffect(() => {
    if (complete) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // 收合：摘要列
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border-2 px-3 py-2.5 text-left",
          complete
            ? "border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5"
            : "border-dashed border-[var(--color-coral)] bg-[var(--color-coral)]/5",
        )}
      >
        <div className="flex items-center gap-2">
          {complete ? (
            <Check className="h-3.5 w-3.5 text-[var(--color-phosphor)]" />
          ) : (
            <X className="h-3.5 w-3.5 text-[var(--color-coral)]" />
          )}
          <span className="text-xs font-bold">朋友 #{idx}</span>
          <span
            className={cn(
              "text-xs",
              complete
                ? "text-[var(--foreground)]"
                : "text-[var(--color-coral)]",
            )}
          >
            {complete
              ? `${companion.name}・${companion.cert}${companion.phone ? `・${companion.phone}` : ""}${companion.relationship ? `・${companion.relationship}` : ""}`
              : "尚未填寫"}
          </span>
        </div>
        <Edit3 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border-2 border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* 整個標題列點下去就收合 */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-m-1 flex flex-1 items-center gap-1.5 rounded p-1 text-left hover:bg-black/5"
          aria-label="收起"
        >
          <span className="text-sm font-bold">朋友 #{idx}</span>
          {complete && (
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {companion.name}・{companion.cert}
            </span>
          )}
          <ChevronUp className="ml-auto h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-1 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10 flex-shrink-0"
          aria-label="刪除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">姓名 *</Label>
            <Input
              value={companion.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="本名"
            />
          </div>
          <div>
            <Label className="text-[10px]">手機</Label>
            <Input
              type="tel"
              value={companion.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="09xx-xxx-xxx"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px]">證照等級 *</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CERTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ cert: c })}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  companion.cert === c
                    ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                    : "border-[var(--border)]",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">證照編號</Label>
            <Input
              value={companion.certNumber}
              onChange={(e) => onChange({ certNumber: e.target.value })}
              placeholder="可選填"
            />
          </div>
          <div>
            <Label className="text-[10px]">累計潛水支數</Label>
            <Input
              inputMode="numeric"
              value={companion.logCount || ""}
              onChange={(e) =>
                onChange({
                  logCount: Number(e.target.value.replace(/\D/g, "") || 0),
                })
              }
              placeholder="例: 25"
              className="text-center"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px]">關係</Label>
          <Input
            value={companion.relationship}
            onChange={(e) => onChange({ relationship: e.target.value })}
            placeholder="家人 / 朋友 / 配偶 / 同事..."
          />
        </div>
      </div>
    </div>
  );
}
