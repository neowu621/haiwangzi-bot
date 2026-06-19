"use client";
import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { ConnDiag } from "@/components/admin-web/ConnDiag";
import { roleLabel } from "@/lib/labels";
import { BrandMark } from "@/components/brand/MantaTrident";
import {
  Menu,
  LogOut,
  BookOpen,
  Users,
  Waves,
  Ship,
  GraduationCap,
  Star,
  Megaphone,
  BarChart2,
  Settings,
  LayoutDashboard,
  ClipboardCheck,
  HelpCircle,
  Newspaper,
  Image as ImageIcon,
  ChevronRight,
  Mail,
  Ticket,
} from "lucide-react";

// v350：側欄改「功能分組」由上而下（即時營運 → 訂單客戶 → 商品 → 行銷 → 分析 → 系統）
const NAV_GROUPS = [
  {
    label: "即時營運",
    items: [
      { href: "/admin", icon: LayoutDashboard, label: "總覽", exact: true },
      { href: "/admin/tonight", icon: ClipboardCheck, label: "老闆結帳" },
    ],
  },
  {
    label: "訂單 / 客戶",
    items: [
      { href: "/admin/bookings", icon: BookOpen, label: "訂單管理" },
      { href: "/admin/custom-orders", icon: BookOpen, label: "🧾 客製開單" },
      { href: "/admin/dive-wishes", icon: BookOpen, label: "📝 願望單" },
      { href: "/admin/users", icon: Users, label: "會員管理" },
      { href: "/admin/credits", icon: Star, label: "抵用金管理" },
    ],
  },
  {
    label: "商品 / 人員",
    items: [
      { href: "/admin/trips", icon: Waves, label: "日潛場次" },
      { href: "/admin/tours", icon: Ship, label: "潛水旅行" },
      { href: "/admin/coaches", icon: GraduationCap, label: "教練管理" },
    ],
  },
  {
    label: "行銷 / 通知",
    items: [
      { href: "/admin/email", icon: Mail, label: "📧 客服信箱" },
      { href: "/admin/promo-codes", icon: Ticket, label: "🎏 節慶優惠" },
      { href: "/admin/promotion", icon: ImageIcon, label: "🎨 業務推廣" },
      { href: "/admin/media-posts", icon: Newspaper, label: "最新動態" },
      { href: "/admin/templates", icon: Megaphone, label: "訊息模板" },
      { href: "/admin/broadcast", icon: Megaphone, label: "群發通知" },
      { href: "/admin/message-log", icon: BookOpen, label: "📋 通訊紀錄" },
    ],
  },
  {
    label: "分析",
    items: [
      { href: "/admin/reports", icon: BarChart2, label: "報表" },
      { href: "/admin/customer-activity", icon: ClipboardCheck, label: "📊 前台活動" },
    ],
  },
  {
    label: "系統",
    items: [
      { href: "/admin/settings", icon: Settings, label: "系統設定" },
      { href: "/admin/audit-logs", icon: ClipboardCheck, label: "操作紀錄" },
      { href: "/admin/guide", icon: HelpCircle, label: "操作說明" },
    ],
  },
];
// 扁平清單（給頂部標題對照用）
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// v530：我的最愛預設常用 4 項（使用者可用星號自訂，存 localStorage）
const DEFAULT_FAVS = ["/admin/tonight", "/admin/bookings", "/admin/dive-wishes", "/admin/email"];

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
  onClick,
  fav,
  onToggleFav,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  active: boolean;
  badge?: number;
  onClick?: () => void;
  fav?: boolean;            // v530：是否已在「我的最愛」
  onToggleFav?: () => void; // 有傳才顯示星號切換
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-white/15 text-white font-semibold"
          : "text-[rgba(230,240,255,0.7)] hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {/* v530：加入/移除「我的最愛」— hover 才浮現，已加最愛恆亮 */}
      {onToggleFav ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav(); }}
          title={fav ? "從我的最愛移除" : "加入我的最愛"}
          aria-label={fav ? "從我的最愛移除" : "加入我的最愛"}
          className={cn("flex-shrink-0 transition-opacity", fav ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        >
          <Star className="h-3.5 w-3.5" style={{ fill: fav ? "var(--color-phosphor)" : "none", color: fav ? "var(--color-phosphor)" : "rgba(230,240,255,0.55)" }} />
        </button>
      ) : null}
      {/* v508：待處理數量徽章 */}
      {badge && badge > 0 ? (
        <span
          className="flex-shrink-0 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
          style={{ minWidth: 18, height: 18, background: "var(--color-coral)", color: "#fff" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
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
  const { ready, logout, adminUser } = useAdminAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // v508：側欄待處理數量徽章（老闆結帳 / 訂單管理 / 願望單）
  const [counts, setCounts] = useState({ tonight: 0, bookings: 0, wishes: 0, emails: 0 });
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    adminFetch<{ tonight: { proofs: number; attendance: number }; pendingProofs: number; pendingWishes: number; pendingEmails: number }>(
      "/api/admin/stats/lite",
    )
      .then((d) => {
        if (alive) setCounts({ tonight: (d.tonight?.proofs ?? 0) + (d.tonight?.attendance ?? 0), bookings: d.pendingProofs ?? 0, wishes: d.pendingWishes ?? 0, emails: d.pendingEmails ?? 0 });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ready, pathname]);
  const badgeFor = (href: string) =>
    href === "/admin/tonight" ? counts.tonight : href === "/admin/bookings" ? counts.bookings : href === "/admin/dive-wishes" ? counts.wishes : href === "/admin/email" ? counts.emails : 0;

  // v521：側欄群組可收合 — 預設只展開「目前所在頁」的群組，其餘收起省 Y 空間
  const isItemActive = (it: { href: string; exact?: boolean }) =>
    "exact" in it && it.exact
      ? pathname === it.href
      : pathname === it.href || pathname.startsWith(it.href + "/");
  const activeGroupLabel = useMemo(() => {
    const g = NAV_GROUPS.find((grp) => grp.items.some((it) => isItemActive(it)));
    return g?.label ?? NAV_GROUPS[0].label;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ [activeGroupLabel]: true });
  // 切頁時自動展開新頁所在群組（不主動關閉其它，使用者想多開也行）
  useEffect(() => {
    setOpenGroups((s) => (s[activeGroupLabel] ? s : { ...s, [activeGroupLabel]: true }));
  }, [activeGroupLabel]);
  const toggleGroup = (label: string) => setOpenGroups((s) => ({ ...s, [label]: !s[label] }));
  const groupBadge = (items: { href: string }[]) => items.reduce((sum, it) => sum + badgeFor(it.href), 0);

  // v530：我的最愛（localStorage 記住，預設 4 項）
  const [favs, setFavs] = useState<string[]>(DEFAULT_FAVS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminFavs");
      if (raw) setFavs(JSON.parse(raw));
    } catch { /* 用預設 */ }
  }, []);
  const toggleFav = (href: string) =>
    setFavs((cur) => {
      const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href];
      try { localStorage.setItem("adminFavs", JSON.stringify(next)); } catch { /* 無痕模式等忽略 */ }
      return next;
    });
  const favItems = favs
    .map((h) => NAV_ITEMS.find((n) => n.href === h))
    .filter((x): x is (typeof NAV_ITEMS)[number] => Boolean(x));

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
      {/* Logo + User Info */}
      <div className="px-4 py-4">
        {/* Brand row — v490：鬼蝠魟三叉戟標誌 */}
        <div className="flex items-center gap-2.5 mb-3">
          <BrandMark size={36} badge />
          <div>
            <div
              className="text-sm font-bold leading-tight"
              style={{ color: "var(--color-phosphor)" }}
            >
              {process.env.NEXT_PUBLIC_APP_NAME ?? "管理後台"}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: "rgba(230,240,255,0.5)" }}>
                管理後台
              </span>
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                style={{ background: "rgba(0,217,203,0.18)", color: "var(--color-phosphor)" }}
              >
                v{APP_VERSION}
              </span>
            </div>
          </div>
        </div>
        {/* Logged-in user row + 登出按鈕 */}
        {adminUser && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
            >
              {(adminUser.realName ?? adminUser.displayName).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold" style={{ color: "#e6f0ff" }}>
                {adminUser.realName ?? adminUser.displayName}
              </div>
              <div className="truncate text-[10px]" style={{ color: "rgba(230,240,255,0.45)" }}>
                {adminUser.effectiveRoles.map(roleLabel).join(" · ")}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: "var(--color-coral)" }}
              title="登出"
              aria-label="登出"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* v401：連線測速面板 */}
        <ConnDiag variant="panel" />
      </div>

      <div className="mx-3 mb-2 border-t border-white/10" />

      {/* Nav（v350：功能分組）*/}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1.5">
        {/* v530：我的最愛 — 常用捷徑，點選單項目的星號可增減 */}
        {favItems.length > 0 && (
          <div className="mb-2 pb-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1 text-[10px] font-bold tracking-wide" style={{ color: "var(--color-phosphor)" }}>
              <Star className="h-3 w-3" style={{ fill: "var(--color-phosphor)" }} /> 我的最愛
            </div>
            <div className="space-y-px">
              {favItems.map((item) => (
                <NavLink
                  key={"fav-" + item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  badge={badgeFor(item.href)}
                  active={isItemActive(item)}
                  fav
                  onToggleFav={() => toggleFav(item.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        )}
        {NAV_GROUPS.map((group) => {
          const open = !!openGroups[group.label];
          const gb = groupBadge(group.items);
          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/5"
                style={{ color: "var(--color-phosphor)" }}
                aria-expanded={open}
              >
                <ChevronRight
                  className="h-3.5 w-3.5 transition-transform"
                  style={{ transform: open ? "rotate(90deg)" : "none", opacity: 0.6 }}
                />
                <span>{group.label}</span>
                {!open && gb > 0 && (
                  <span
                    className="ml-auto rounded-full px-1.5 text-[9px] font-bold leading-[1.5]"
                    style={{ background: "var(--color-coral)", color: "#fff" }}
                  >
                    {gb > 99 ? "99+" : gb}
                  </span>
                )}
              </button>
              {open && (
                <div className="ml-[18px] space-y-px border-l border-white/10 pl-1.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      badge={badgeFor(item.href)}
                      active={isItemActive(item)}
                      fav={favs.includes(item.href)}
                      onToggleFav={() => toggleFav(item.href)}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
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
                "exact" in n && n.exact
                  ? pathname === n.href
                  : pathname === n.href || pathname.startsWith(n.href + "/"),
              )?.label ??
              "管理後台"}
          </h1>

          {/* v401：頂部連線延遲徽章（點一下重測）*/}
          <ConnDiag variant="badge" />

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
