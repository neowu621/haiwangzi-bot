import { prisma } from "@/lib/prisma";
import { previewUrl, r2Configured, type R2Prefix } from "@/lib/r2";
import { PrintButton } from "./PrintButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公開合約檢視頁（?t=payLinkToken 保護）— 已簽署的客製訂單合約，可列印 / 另存 PDF。客戶與老闆各自留存。
export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  if (!t) return <Invalid msg="缺少存取權杖" />;
  const booking = await prisma.booking.findFirst({
    where: { id, payLinkToken: t, type: "custom" },
    include: { user: { select: { displayName: true, realName: true, code: true } } },
  });
  if (!booking) return <Invalid msg="連結無效或非客製訂單" />;
  if (!booking.signedAt) return <Invalid msg="此合約尚未簽署" />;

  const tpl = booking.customCategory
    ? await prisma.contractTemplate.findUnique({ where: { category: booking.customCategory } })
    : null;

  let sigUrl: string | null = null;
  if (booking.signatureImageKey && r2Configured()) {
    try {
      const prefix = booking.signatureImageKey.split("/")[0] as R2Prefix;
      sigUrl = await previewUrl(prefix, booking.signatureImageKey);
    } catch { sigUrl = null; }
  }

  const customer = booking.user.realName ?? booking.user.displayName ?? "客戶";
  const signedAt = booking.signedAt.toLocaleString("zh-TW", { dateStyle: "long", timeStyle: "short" });

  return (
    <div style={{ background: "#f3f5f7", minHeight: "100vh", padding: "24px 12px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <PrintButton />
        </div>

        <div style={{ background: "#fff", borderRadius: 10, padding: "36px 40px", boxShadow: "0 2px 12px rgba(0,0,0,.08)", color: "#1a2330", fontSize: 14, lineHeight: 1.9 }}>
          <div style={{ textAlign: "center", borderBottom: "2px solid #0a2342", paddingBottom: 14, marginBottom: 22 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>東北角海王子潛水團</div>
            <div style={{ fontSize: 12, color: "#0a8f86", letterSpacing: 3 }}>SEA PRINCE DIVING</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 14 }}>{tpl?.title ?? booking.customItemName} — 服務合約書</div>
          </div>

          <table style={{ width: "100%", fontSize: 13.5, marginBottom: 20, borderCollapse: "collapse" }}>
            <tbody>
              <Row k="合約編號" v={booking.code ?? booking.id.slice(0, 8)} />
              <Row k="簽署人（甲方·客戶）" v={`${customer}${booking.user.code ? `（會員 ${booking.user.code}）` : ""}`} />
              <Row k="服務方（乙方）" v="東北角海王子潛水團" />
              <Row k="服務項目" v={booking.customItemName ?? "—"} />
              <Row k="費用" v={`NT$ ${booking.totalAmount.toLocaleString()}`} />
              {booking.customRefUrl && <Row k="課程內容參考" v={booking.customRefUrl} />}
              <Row k="簽署時間" v={signedAt} />
            </tbody>
          </table>

          <div style={{ fontWeight: 700, marginBottom: 8 }}>合約條款</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 16px", marginBottom: 24, background: "#fafcfc" }}>
            {tpl?.content || "（本合約條款由服務方提供）"}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>甲方（客戶）簽名</div>
              {sigUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sigUrl} alt="客戶簽名" style={{ maxHeight: 80, maxWidth: 240, borderBottom: "1px solid #1a2330" }} />
              ) : (
                <div style={{ borderBottom: "1px solid #1a2330", height: 60 }} />
              )}
              <div style={{ fontSize: 12, marginTop: 4 }}>{customer}</div>
            </div>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>乙方（海王子）</div>
              <div style={{ borderBottom: "1px solid #1a2330", height: 60, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", paddingBottom: 4, fontWeight: 700, color: "#0a2342" }}>東北角海王子潛水團</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>汪汪教練</div>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 10.5, color: "#9aabae", marginTop: 28, borderTop: "1px solid #eef2f2", paddingTop: 10 }}>
            本合約以電子簽署方式締結，簽署時間與簽名為法律證據。請列印或另存 PDF 留存。
          </div>
        </div>
      </div>
      <style>{`@media print { .no-print { display: none !important } body { background: #fff } }`}</style>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: "5px 0", color: "#6b7280", width: 150, verticalAlign: "top" }}>{k}</td>
      <td style={{ padding: "5px 0", fontWeight: 600, wordBreak: "break-all" }}>{v}</td>
    </tr>
  );
}

function Invalid({ msg }: { msg: string }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c8a96", fontSize: 15 }}>
      ⚠ {msg}
    </div>
  );
}
