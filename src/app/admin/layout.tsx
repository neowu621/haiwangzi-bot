import type { ReactNode } from "react";

export const metadata = { title: `管理後台 — ${process.env.NEXT_PUBLIC_APP_NAME ?? ""}`.trim() };

export default function AdminWebLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
