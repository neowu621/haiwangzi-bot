"use client";
// v697：潛水預約整合頁 —— 一日潛水 / 旅行潛水 / 預約潛水 三合一,頂部三選項即時切換(不重載)。
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { CalendarContent } from "@/components/liff/CalendarContent";
import { TourContent } from "@/components/liff/TourContent";
import { WishesContent } from "@/components/liff/WishesContent";
import { cn } from "@/lib/utils";

type Tab = "calendar" | "tour" | "wishes";
const TABS: Array<{ k: Tab; label: string }> = [
  { k: "calendar", label: "一日潛水" },
  { k: "tour", label: "旅行潛水" },
  { k: "wishes", label: "預約潛水" },
];
const TITLE: Record<Tab, string> = { calendar: "一日潛水", tour: "旅行潛水", wishes: "預約潛水" };

function BookingInner() {
  const sp = useSearchParams();
  const q = sp.get("tab") as Tab | null;
  const initial: Tab = q && ["calendar", "tour", "wishes"].includes(q) ? q : "calendar";
  const [tab, setTab] = useState<Tab>(initial);
  // 首次點到才掛載該子分頁(lazy);掛載後保留,切換只切顯示 → 不重載、保留狀態
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set([initial]));
  const go = (t: Tab) => { setTab(t); setMounted((s) => (s.has(t) ? s : new Set(s).add(t))); };

  return (
    <LiffShell title={TITLE[tab]} backHref="/liff/home" bottomNav={<BottomNav />}>
      <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--background)] px-3 py-2">
        {TABS.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => go(k)}
            className={cn(
              "flex-1 rounded-full py-2 text-sm font-semibold transition-colors",
              tab === k ? "bg-[var(--color-ocean-deep)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mounted.has("calendar") && <div style={{ display: tab === "calendar" ? "block" : "none" }}><CalendarContent onGoWishes={() => go("wishes")} /></div>}
      {mounted.has("tour") && <div style={{ display: tab === "tour" ? "block" : "none" }}><TourContent onGoWishes={() => go("wishes")} /></div>}
      {mounted.has("wishes") && <div style={{ display: tab === "wishes" ? "block" : "none" }}><WishesContent /></div>}
    </LiffShell>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={null}>
      <BookingInner />
    </Suspense>
  );
}
