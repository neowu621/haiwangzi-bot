"use client";
import * as React from "react";
import { Check, AlertTriangle, ChevronDown } from "lucide-react";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 可折疊 Card
 *
 * 行為：
 *  - 收合時顯示 title + 摘要文字（complete 時綠勾摘要、否則紅色「必填」提示）
 *  - 展開時 children 完整顯示
 *
 * 用法：
 *  <CollapsibleCard title="個人資料" required complete={ok} open={open} onToggle={...} summary="...">
 *    <Form />
 *  </CollapsibleCard>
 */
export function CollapsibleCard({
  title,
  required,
  complete,
  open,
  onToggle,
  summary,
  rightHint,
  children,
}: {
  title: string;
  required?: boolean;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  summary?: string;
  /** 折疊時右側額外提示（e.g. "3 位同伴"） */
  rightHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "transition-colors",
        !complete && required && "border-[var(--color-coral)]/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          {complete ? (
            <Check className="h-4 w-4 flex-shrink-0 text-[var(--color-phosphor)]" />
          ) : required ? (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--color-coral)]" />
          ) : null}
          <div className="flex min-w-0 flex-col leading-tight">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base">{title}</CardTitle>
              {required && !complete && (
                <span className="rounded-full bg-[var(--color-coral)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-coral)]">
                  必填
                </span>
              )}
              {rightHint && (
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {rightHint}
                </span>
              )}
            </div>
            {!open && summary && (
              <span
                className={cn(
                  "truncate text-xs",
                  complete
                    ? "text-[var(--muted-foreground)]"
                    : "text-[var(--color-coral)]",
                )}
              >
                {summary}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
