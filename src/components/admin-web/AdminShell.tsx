"use client";
import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import {
  Menu,
  LogOut,
  BookOpen,
  Users,
  Waves,
  Ship,
  GraduationCap,
  MapPin,
  Star,
  Megaphone,
  BarChart2,
  Settings,
  LayoutDashboard,
  ClipboardCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", icon: LayoutDashboard, label: "總覽", exact: true },
  { href: "/admin/bookings", icon: BookOpen, label: "訂單管理" },
  { href: "/admin/users", icon: Users, label: "會員管理" },
  { href: "/admin/trips", icon: Waves, label: "日潛場次" },
  { href: "/admin/tours", icon: Ship, label: "潛水團" },
  { href: "/admin/coaches", icon: GraduationCap, label: "教練管理" },
  { href: "/admin/sites", icon: MapPin, label: "潛點管理" },
  { href: "/admin/vip-tiers", icon: Star, label: "VIP 設定" },
  { href: "/admin/broadcast", icon: Megaphone, label: "群發通知" },
  { href: "/admin/reports", icon: BarChart2, label: "報表" },
  { href: "/admin/settings", icon: Settings, label: "系統設定" },
  { href: "/admin/audit-logs", icon: ClipboardCheck, label: "操作紀錄" },
];

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
          : "text-[rgba(230,240,255,0.7)] hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

export function AdminShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { ready, logout } = useAdminAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      </div>
    );
  }

  const sidebar = (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--color-ocean-deep)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="text-2xl">🤿</span>
        <div>
          <div
            className="text-sm font-bold"
            style={{ color: "var(--color-phosphor)" }}
          >
            海王子
          </div>
          <div className="text-[10px]" style={{ color: "rgba(230,240,255,0.5)" }}>
            管理後台
          </div>
        </div>
      </div>

      <div className="mx-3 mb-2 border-t border-white/10" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={
              item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/")
            }
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* Version */}
      <div className="px-5 pb-2 text-center">
        <span
          className="rounded px-2 py-0.5 font-mono text-[10px]"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(230,240,255,0.3)" }}
        >
          v{APP_VERSION}
        </span>
      </div>

      {/* Logout */}
      <div className="p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
          style={{ color: "var(--color-coral)" }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          登出
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-pearl)" }}>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-shrink-0 lg:block">
        <div className="fixed left-0 top-0 h-full w-56 overflow-y-auto">{sidebar}</div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-56 z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3"
          style={{
            background: "var(--color-ocean-surface)",
            borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <h1
            className="flex-1 text-base font-semibold"
            style={{ color: "#e6f0ff" }}
          >
            {title ??
              NAV_ITEMS.find((n) =>
                n.exact
                  ? pathname === n.href
                  : pathname === n.href || pathname.startsWith(n.href + "/"),
              )?.label ??
              "管理後台"}
          </h1>

          {/* Mobile logout */}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 lg:hidden"
            title="登出"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
