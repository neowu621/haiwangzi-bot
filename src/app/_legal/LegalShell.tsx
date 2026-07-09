import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

// v481：隱私權政策 / 服務條款 / FAQ / 安全政策 共用版型（品牌化、可列印）
// v826：頂部/頁尾改用全站共用深色 SiteHeader/SiteFooter（內容維持淺色）
export function LegalShell({ title, updated, children, backHref = "/pclogin", backLabel = "返回會員預約", wide, current }: { title: string; updated: string; children: React.ReactNode; backHref?: string; backLabel?: string; wide?: boolean; current?: string }) {
  const maxW = wide ? 920 : 820;
  return (
    <div style={{ minHeight: "100vh", background: "#eef3f6", color: "#1A2330", fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif" }}>
      <SiteHeader current={current} />
      <main style={{ maxWidth: maxW, margin: "0 auto", padding: "32px 22px 64px" }}>
        <div style={{ background: "#fff", border: "1px solid #dfe7ee", borderRadius: 16, padding: "clamp(24px,4vw,42px)", boxShadow: "0 4px 20px rgba(10,35,66,.06)" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0A2342", margin: "0 0 6px" }}>{title}</h1>
          <div style={{ fontSize: 12.5, color: "#7c9296", marginBottom: 24 }}>最後更新：{updated}</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.85, color: "#33464e" }}>{children}</div>
        </div>
        <div style={{ textAlign: "center", marginTop: 22 }}>
          <Link href={backHref} style={{ color: "#0a8f86", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>← {backLabel}</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: "#0A2342", margin: "0 0 8px" }}>{no}. {title}</h2>
      {children}
    </section>
  );
}
