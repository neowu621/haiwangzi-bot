"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Plane, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: Array<{
  href: string;
  label: string;
  match: RegExp;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/liff/calendar", label: "日潛", match: /^\/liff\/(calendar|dive)/, Icon: CalendarDays },
  { href: "/liff/tour", label: "潛水團", match: /^\/liff\/tour/, Icon: Plane },
  { href: "/liff/my", label: "我的", match: /^\/liff\/my/, Icon: ListChecks },
  { href: "/liff/profile", label: "個人", match: /^\/liff\/profile/, Icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-[var(--border)] bg-[var(--background)]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur">
      {NAV.map(({ href, label, match, Icon }) => {
        const active = match.test(pathname ?? "");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium",
              active
                ? "text-[var(--color-phosphor)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
