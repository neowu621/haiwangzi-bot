"use client";
import { useEffect, useState } from "react";
import {
  Save,
  Edit3,
  Phone,
  Award,
  ListChecks,
  Users,
  Plus,
  Trash2,
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [cert, setCert] = useState<(typeof CERTS)[number] | "">("");
  const [certNumber, setCertNumber] = useState("");
  const [logCount, setLogCount] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");
  const [notes, setNotes] = useState("");

  // 同伴管理
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionDraft, setCompanionDraft] = useState<Companion | null>(null);
  const [savingCompanions, setSavingCompanions] = useState(false);

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

  async function persistCompanions(next: Companion[]) {
    setSavingCompanions(true);
    try {
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ companions: next }),
      });
      setCompanions(next);
    } finally {
      setSavingCompanions(false);
    }
  }

  function startNewCompanion() {
    setCompanionDraft({
      id: crypto.randomUUID(),
      name: "",
      phone: "",
      cert: null,
      certNumber: "",
      logCount: 0,
      relationship: "",
    });
  }

  async function commitDraft() {
    if (!companionDraft) return;
    if (companionDraft.name.trim().length < 1) return;
    const existing = companions.findIndex((c) => c.id === companionDraft.id);
    const next =
      existing >= 0
        ? companions.map((c, i) => (i === existing ? companionDraft : c))
        : [...companions, companionDraft];
    await persistCompanions(next);
    setCompanionDraft(null);
  }

  async function removeCompanion(id: string) {
    if (!confirm("確定刪除這位同伴？")) return;
    await persistCompanions(companions.filter((c) => c.id !== id));
  }

  async function save() {
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
      setEditing(false);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

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
        editing ? (
          <Button size="sm" disabled={saving} onClick={save}>
            <Save className="h-4 w-4" />
            {saving ? "儲存..." : "儲存"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit3 className="h-4 w-4" />
            編輯
          </Button>
        )
      }
    >
      <div className="space-y-4 px-4 pt-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Avatar className="h-16 w-16">
              <AvatarImage src={liff.profile?.pictureUrl} />
              <AvatarFallback>
                {(me.realName || me.displayName).slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="text-lg font-bold">
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
          <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
            <div>
              <div className="text-2xl font-bold tabular text-[var(--color-phosphor)]">
                {me.logCount}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                累計 Log
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular">
                {me.stats.totalBookings}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                預約紀錄
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular text-[var(--color-coral)]">
                {me.stats.completed}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                已完成
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              聯絡資訊
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="姓名"
              value={realName}
              setValue={setRealName}
              editing={editing}
            />
            <Field
              label="手機"
              type="tel"
              value={phone}
              setValue={setPhone}
              editing={editing}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" />
              潛水經歷
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>證照等級</Label>
              {editing ? (
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
              ) : (
                <div className="mt-1 text-base font-semibold">
                  {cert || "—"}
                </div>
              )}
            </div>
            <Field
              label="證照編號"
              value={certNumber}
              setValue={setCertNumber}
              editing={editing}
            />
            <Field
              label="累計潛水次數"
              type="numeric"
              value={logCount}
              setValue={setLogCount}
              editing={editing}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />
              緊急聯絡人
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="姓名"
              value={emergencyName}
              setValue={setEmergencyName}
              editing={editing}
            />
            <Field
              label="關係"
              value={emergencyRel}
              setValue={setEmergencyRel}
              editing={editing}
            />
            <Field
              label="手機"
              type="tel"
              value={emergencyPhone}
              setValue={setEmergencyPhone}
              editing={editing}
            />
          </CardContent>
        </Card>

        {/* 同伴管理 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              常用同伴 ({companions.length})
            </CardTitle>
            <p className="-mt-1 text-[11px] text-[var(--muted-foreground)]">
              下次多人預約時可直接挑選，省去重複輸入
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {companions.length === 0 && !companionDraft && (
              <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
                還沒有儲存的同伴。預約時帶人會自動加入，或在這手動新增。
              </div>
            )}
            {companions.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {c.name}
                    {c.cert && (
                      <Badge variant="muted" className="ml-1.5 text-[10px]">
                        {c.cert}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] tabular text-[var(--muted-foreground)]">
                    {c.phone || "—"}
                    {c.logCount > 0 && ` · ${c.logCount} logs`}
                    {c.relationship && ` · ${c.relationship}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCompanionDraft({ ...c })}
                  className="rounded-full p-1.5 hover:bg-[var(--muted)]"
                  aria-label="編輯"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCompanion(c.id)}
                  className="rounded-full p-1.5 hover:bg-[var(--color-coral)]/15 text-[var(--color-coral)]"
                  aria-label="刪除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {companionDraft ? (
              <div className="rounded-lg border-2 border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={companionDraft.name}
                    onChange={(e) =>
                      setCompanionDraft({
                        ...companionDraft,
                        name: e.target.value,
                      })
                    }
                    placeholder="姓名 *"
                  />
                  <Input
                    type="tel"
                    value={companionDraft.phone}
                    onChange={(e) =>
                      setCompanionDraft({
                        ...companionDraft,
                        phone: e.target.value,
                      })
                    }
                    placeholder="手機"
                  />
                  <select
                    value={companionDraft.cert ?? ""}
                    onChange={(e) =>
                      setCompanionDraft({
                        ...companionDraft,
                        cert: (e.target.value ||
                          null) as Companion["cert"],
                      })
                    }
                    className="flex h-11 w-full rounded-[var(--radius-card)] border border-[var(--input)] bg-white pl-3 pr-2 text-sm"
                  >
                    <option value="">證照</option>
                    {CERTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Input
                    inputMode="numeric"
                    value={companionDraft.logCount || ""}
                    onChange={(e) =>
                      setCompanionDraft({
                        ...companionDraft,
                        logCount: Number(
                          e.target.value.replace(/\D/g, "") || 0,
                        ),
                      })
                    }
                    placeholder="累計潛水支數"
                    className="text-center"
                  />
                </div>
                <Input
                  value={companionDraft.relationship}
                  onChange={(e) =>
                    setCompanionDraft({
                      ...companionDraft,
                      relationship: e.target.value,
                    })
                  }
                  placeholder="關係（家人/朋友/配偶...）"
                  className="mt-2"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCompanionDraft(null)}
                    disabled={savingCompanions}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={commitDraft}
                    disabled={
                      savingCompanions || companionDraft.name.trim() === ""
                    }
                  >
                    {savingCompanions ? "..." : "儲存"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={startNewCompanion}
              >
                <Plus className="h-4 w-4" />
                新增同伴
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">備註 (教練可見)</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <textarea
                className="w-full rounded-[var(--radius-card)] border border-[var(--input)] bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="耳壓平衡 / 過敏 / 慢性病 / 用藥 / 裝備偏好..."
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
                {notes || "—"}
              </div>
            )}
          </CardContent>
        </Card>

        {savedAt && (
          <div className="rounded-lg bg-[var(--color-phosphor)]/15 p-3 text-center text-sm font-semibold text-[var(--color-ocean-deep)]">
            ✓ 已儲存
          </div>
        )}
      </div>
    </LiffShell>
  );
}

function Field({
  label,
  value,
  setValue,
  editing,
  type = "text",
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  editing: boolean;
  type?: "text" | "tel" | "numeric";
}) {
  return (
    <div>
      <Label>{label}</Label>
      {editing ? (
        <Input
          type={type === "numeric" ? "text" : type}
          inputMode={type === "numeric" ? "numeric" : undefined}
          value={value}
          onChange={(e) =>
            setValue(
              type === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value,
            )
          }
        />
      ) : (
        <div className="mt-1 text-base">{value || "—"}</div>
      )}
    </div>
  );
}
