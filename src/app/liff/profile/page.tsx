"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Phone,
  Award,
  ListChecks,
  Users,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    await liff.fetchWithAuth("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ companions: next }),
    });
    setCompanions(next);
    setSavedAt(Date.now());
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
    setCompanions([...companions, c]);
    setCompanionsOpen(true);
  }

  async function updateCompanion(id: string, patch: Partial<Companion>) {
    const next = companions.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    setCompanions(next);
    // 防抖儲存
    if (saveCompTimer) clearTimeout(saveCompTimer);
    saveCompTimer = setTimeout(() => {
      persistCompanions(next);
    }, 600);
  }

  async function removeCompanion(id: string) {
    if (!confirm("確定刪除這位同伴？")) return;
    await persistCompanions(companions.filter((c) => c.id !== id));
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
            <div>
              <div className="text-xl font-bold tabular text-[var(--color-phosphor)]">
                {me.logCount}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                累計 Log
              </div>
            </div>
            <div>
              <div className="text-xl font-bold tabular">
                {me.stats.totalBookings}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                預約紀錄
              </div>
            </div>
            <div>
              <div className="text-xl font-bold tabular text-[var(--color-coral)]">
                {me.stats.completed}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                已完成
              </div>
            </div>
          </CardContent>
        </Card>

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
    </LiffShell>
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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">朋友 #{idx}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
            aria-label="刪除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-[var(--muted-foreground)] hover:bg-black/5"
            aria-label="收起"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
