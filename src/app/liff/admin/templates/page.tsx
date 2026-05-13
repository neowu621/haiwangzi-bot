"use client";
import { useEffect, useState } from "react";
import { Send, RotateCcw, Save, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiffShell } from "@/components/shell/LiffShell";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

type FieldKey = "title" | "subtitle" | "bodyText" | "buttonLabel" | "altText";

interface EditableField {
  key: FieldKey;
  label: string;
  defaultValue: string;
}

interface TemplateInfo {
  key: string;
  label: string;
  editableFields: EditableField[];
  override: {
    title: string | null;
    subtitle: string | null;
    bodyText: string | null;
    buttonLabel: string | null;
    altText: string | null;
    updatedAt: string;
  } | null;
}

export default function AdminTemplatesPage() {
  const liff = useLiff();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<FieldKey, string>>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<{ key: string; at: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  async function reload() {
    try {
      const d = await liff.fetchWithAuth<{ templates: TemplateInfo[] }>(
        "/api/admin/templates",
      );
      setTemplates(d.templates);
      // 初始化 drafts 從 override 拿
      const next: typeof drafts = {};
      for (const t of d.templates) {
        const fields: Partial<Record<FieldKey, string>> = {};
        if (t.override) {
          for (const f of t.editableFields) {
            fields[f.key] = t.override[f.key] ?? "";
          }
        }
        next[t.key] = fields;
      }
      setDrafts(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  async function saveOverride(key: string) {
    setSaving(key);
    setErr(null);
    try {
      const draft = drafts[key] || {};
      // 把空字串轉成 null（表示用預設）
      const body: Record<string, string | null> = { key };
      for (const f of ["title", "subtitle", "bodyText", "buttonLabel", "altText"] as const) {
        const v = draft[f];
        body[f] = v && v.trim().length > 0 ? v : null;
      }
      await liff.fetchWithAuth("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSavedAt({ key, at: Date.now() });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function resetOverride(key: string) {
    if (!confirm("確定還原為預設文字？您目前的覆寫會被刪除")) return;
    setSaving(key);
    try {
      await liff.fetchWithAuth(
        `/api/admin/templates?key=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function testSend(key: string) {
    setSending(key);
    setErr(null);
    try {
      await liff.fetchWithAuth("/api/admin/templates/test-send", {
        method: "POST",
        body: JSON.stringify({ key }),
      });
      alert("已推到您的 LINE，去看看");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      alert("試送失敗：" + msg);
    } finally {
      setSending(null);
    }
  }

  function setDraftField(key: string, field: FieldKey, value: string) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));
  }

  return (
    <LiffShell title="訊息模板" backHref="/liff/admin/dashboard">
      <div className="space-y-3 px-4 pt-4">
        {err && (
          <div className="rounded-lg bg-[var(--color-coral)]/15 p-3 text-sm text-[var(--color-coral)]">
            {err}
          </div>
        )}
        <div className="rounded-lg bg-[var(--muted)] p-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          每張卡的「動態資料」（客戶名、日期、金額）由系統自動填，這裡只改文字描述。
          留空 = 用預設文字。改完按「儲存」，再「試送到我自己」確認效果。
        </div>

        {templates.map((t) => {
          const hasOverride = !!t.override;
          const draft = drafts[t.key] || {};
          const isSaving = saving === t.key;
          const isSending = sending === t.key;
          const justSaved = savedAt?.key === t.key && Date.now() - savedAt.at < 3000;
          return (
            <CollapsibleCard
              key={t.key}
              title={t.label}
              complete={hasOverride}
              open={openMap[t.key] ?? false}
              onToggle={() =>
                setOpenMap((m) => ({ ...m, [t.key]: !m[t.key] }))
              }
              rightHint={
                hasOverride ? (
                  <Badge variant="default" className="text-[9px]">
                    已自訂
                  </Badge>
                ) : (
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    預設
                  </span>
                )
              }
              summary={
                hasOverride
                  ? `${t.override?.title ?? t.editableFields[0]?.defaultValue ?? ""}`.slice(
                      0,
                      28,
                    )
                  : t.editableFields[0]?.defaultValue ?? ""
              }
            >
              <div className="space-y-3">
                {t.editableFields.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">
                      {f.label}
                      <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">
                        （預設：{f.defaultValue}）
                      </span>
                    </Label>
                    <Input
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraftField(t.key, f.key, e.target.value)}
                      placeholder={f.defaultValue}
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => saveOverride(t.key)}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    {justSaved ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> 已儲存
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? "儲存中..." : "儲存"}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testSend(t.key)}
                    disabled={isSending}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isSending ? "推送中..." : "試送到我"}
                  </Button>
                  {hasOverride && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetOverride(t.key)}
                      disabled={isSaving}
                      title="還原為預設"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CollapsibleCard>
          );
        })}
      </div>
    </LiffShell>
  );
}
