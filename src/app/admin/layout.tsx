import type { ReactNode } from "react";

export const metadata = { title: "管理後台 — 東北角海王子" };

export default function AdminWebLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
