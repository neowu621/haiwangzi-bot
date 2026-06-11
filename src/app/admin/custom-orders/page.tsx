"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

interface Member { lineUserId: string; displayName: string; realName: string | null; code: string | null; email: string | null }
interface Contract { id: string; category: string; title: string; content: string; refUrl: string | null; active: boolean; sortOrder: number }
interface Order {
  id: string; code: string | null; customer: string; memberCode: string | null;
  itemName: string | null; category: string | null; amount: number; paidAmount: number;
  status: string; paymentStatus: string; signed: boolean;
  payLink: string | null; contractLink: string | null; createdAt: string;
}

export default function CustomOrdersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  // 建單表單
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Member | null>(null);
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [creating, setCreating] = useState(false);

  // 合約範本編輯
  const [editC, setEditC] = useState<Contract | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, c, o] = await Promise.all([
        adminFetch<{ users: Array<Member & { role?: string }> }>("/api/admin/users"),
        adminFetch<{ templates: Contract[] }>("/api/admin/contract-templates"),
        adminFetch<{ orders: Order[] }>("/api/admin/custom-orders"),
      ]);
      setMembers(u.users ?? []);
      setContracts(c.templates ?? []);
      setOrders(o.orders ?? []);
      if (!category && (c.templates?.length ?? 0) > 0) setCategory(c.templates[0].category);
    } catch (e) { showToast("載入失敗：" + (e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members.filter((m) =>
      (m.realName ?? "").toLowerCase().includes(q) ||
      (m.displayName ?? "").toLowerCase().includes(q) ||
      (m.code ?? "").toLowerCase().includes(q),
    ).slice(0, 8);
  }, [search, members]);

  async function createOrder() {
    if (!picked) return showToast("請先選擇會員");
    const amt = Number(amount);
    if (!itemName.trim() || !Number.isFinite(amt) || amt <= 0) return showToast("請填品項與正確金額");
    if (!category) return showToast("請選擇合約類別");
    setCreating(true);
    try {
      const r = await adminFetch<{ ok: boolean; booking: { payLink: string } }>("/api/admin/custom-orders", {
        method: "POST",
        body: JSON.stringify({ userId: picked.lineUserId, itemName: itemName.trim(), amount: amt, category, refUrl, adminNote }),
      });
      showToast("✅ 已開單並通知會員");
      setItemName(""); setAmount(""); setRefUrl(""); setAdminNote(""); setPicked(null); setSearch("");
      navigator.clipboard?.writeText(r.booking.payLink).catch(() => {});
      await reload();
    } catch (e) { showToast("開單失敗：" + (e instanceof Error ? e.message : String(e))); }
    finally { setCreating(false); }
  }

  async function saveContract(c: Contract) {
    try {
      await adminFetch("/api/admin/contract-templates", { method: "POST", body: JSON.stringify(c) });
      showToast("✅ 合約範本已儲存");
      setEditC(null);
      await reload();
    } catch (e) { showToast("儲存失敗：" + (e instanceof Error ? e.message : String(e))); }
  }

  return (
    <AdminShell title="客製化訂單">
      <div style={{ padding: 16, maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(320px,1fr) minmax(320px,1.2fr)", gap: 16, alignItems: "start" }}>
        {/* 開單 */}
        <div style={card}>
          <h3 style={h3}>📋 老闆開單給會員</h3>
          <p style={hint}>會員須先註冊。開單後會員會收到 LINE / Email / 站內通知，含付款連結，閱讀並簽署合約後付款。</p>

          <label style={lab}>選擇會員</label>
          {picked ? (
            <div style={{ ...pickedBox }}>
              <span><b>{picked.realName ?? picked.displayName}</b> <span style={{ color: "#7c8a96", fontSize: 11 }}>{picked.code ?? ""}</span></span>
              <button onClick={() => { setPicked(null); setSearch(""); }} style={xBtn}>✕</button>
            </div>
          ) : (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋會員姓名 / 編號" style={inp} />
              {filtered.length > 0 && (
                <div style={{ border: "1px solid #e3e9ec", borderRadius: 8, marginTop: 4, maxHeight: 200, overflow: "auto" }}>
                  {filtered.map((m) => (
                    <div key={m.lineUserId} onClick={() => { setPicked(m); setSearch(""); }} style={pickRow}>
                      <b>{m.realName ?? m.displayName}</b> <span style={{ color: "#7c8a96", fontSize: 11 }}>{m.code ?? ""} {m.email ? `· ${m.email}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <label style={lab}>品項名稱</label>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="例：OW 開放水域潛水員課程" style={inp} />

          <label style={lab}>金額 NT$</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="14500" style={inp} />

          <label style={lab}>合約類別</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
            {contracts.filter((c) => c.active).map((c) => <option key={c.category} value={c.category}>{c.title}</option>)}
          </select>

          <label style={lab}>參考連結（課程內容說明，可空）</label>
          <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="https://..." style={inp} />

          <label style={lab}>備註（僅內部，可空）</label>
          <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="例：參加 6 月梯次" style={inp} />

          <button onClick={createOrder} disabled={creating} style={primaryBtn}>{creating ? "開單中…" : "💸 開單並通知會員"}</button>
        </div>

        {/* 訂單列表 */}
        <div style={card}>
          <h3 style={h3}>客製訂單紀錄</h3>
          {loading ? <p style={hint}>載入中…</p> : orders.length === 0 ? <p style={hint}>尚無客製訂單。</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map((o) => (
                <div key={o.id} style={orderRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{o.itemName} · NT$ {o.amount.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: "#7c8a96" }}>給 {o.customer}（{o.memberCode}）· {o.code} · {new Date(o.createdAt).toLocaleDateString("zh-TW")}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={badge(o.paymentStatus === "paid" ? "#0a8f6a" : "#c08a2b")}>付款：{o.paymentStatus}</span>{" "}
                      <span style={badge(o.signed ? "#0a8f6a" : "#9aa")}>{o.signed ? "已簽署" : "未簽署"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {o.payLink && (
                      <button onClick={() => { navigator.clipboard?.writeText(o.payLink!); showToast("已複製付款連結"); }} style={smallBtn}>複製付款連結</button>
                    )}
                    {o.contractLink && (
                      <a href={o.contractLink} target="_blank" rel="noopener" style={{ ...smallBtn, textAlign: "center", textDecoration: "none", color: "#0e4c5a" }}>📄 合約 PDF</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 合約範本管理 */}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <h3 style={h3}>📑 合約範本（簽署 PDF 用的條款，老闆自行編輯）</h3>
          <p style={hint}>每個合約類別的條款內容由您填寫。會員簽署時會看到此內容，簽署後會產生 PDF 存檔（您與客戶各一份）。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
            {contracts.map((c) => (
              <div key={c.id} style={{ border: "1px solid #e3e9ec", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: c.content.startsWith("（請填入") ? "#c0392b" : "#7c8a96", margin: "4px 0", lineHeight: 1.5, maxHeight: 48, overflow: "hidden" }}>
                  {c.content.startsWith("（請填入") ? "⚠ 尚未填寫條款" : c.content.slice(0, 60) + "…"}
                </div>
                <button onClick={() => setEditC(c)} style={smallBtn}>編輯條款</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 合約編輯 modal */}
      {editC && (
        <div style={modalBg} onClick={() => setEditC(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={h3}>編輯合約：{editC.title}</h3>
            <label style={lab}>顯示名稱</label>
            <input value={editC.title} onChange={(e) => setEditC({ ...editC, title: e.target.value })} style={inp} />
            <label style={lab}>條款全文</label>
            <textarea value={editC.content} onChange={(e) => setEditC({ ...editC, content: e.target.value })} rows={12} style={{ ...inp, fontFamily: "inherit", resize: "vertical" }} />
            <label style={lab}>課程內容參考連結</label>
            <input value={editC.refUrl ?? ""} onChange={(e) => setEditC({ ...editC, refUrl: e.target.value })} style={inp} placeholder="https://..." />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => saveContract(editC)} style={primaryBtn}>儲存</button>
              <button onClick={() => setEditC(null)} style={{ ...smallBtn, padding: "10px 18px" }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </AdminShell>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ec", borderRadius: 12, padding: 16 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0e4c5a", margin: "0 0 8px" };
const hint: React.CSSProperties = { fontSize: 11.5, color: "#7c8a96", lineHeight: 1.6, marginBottom: 10 };
const lab: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#43525a", margin: "10px 0 4px" };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 13, padding: "9px 11px", borderRadius: 8, border: "1px solid #cdd9de" };
const primaryBtn: React.CSSProperties = { width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 9, background: "linear-gradient(120deg,#13b5a6,#1ed4c2)", color: "#04323a", fontSize: 13.5, fontWeight: 800, cursor: "pointer" };
const smallBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: "1px solid #cdd9de", background: "#fff", cursor: "pointer", whiteSpace: "nowrap" };
const pickedBox: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #b9e3dd", background: "#eef9f7", borderRadius: 8, padding: "8px 11px", fontSize: 13 };
const xBtn: React.CSSProperties = { border: "none", background: "transparent", cursor: "pointer", color: "#7c8a96", fontSize: 14 };
const pickRow: React.CSSProperties = { padding: "8px 11px", fontSize: 12.5, cursor: "pointer", borderBottom: "1px solid #f0f3f4" };
const orderRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, border: "1px solid #e3e9ec", borderRadius: 9, padding: "9px 11px" };
const badge = (c: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, color: c, background: c + "1a", padding: "1px 7px", borderRadius: 12 });
const modalBg: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 18, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto" };
const toastStyle: React.CSSProperties = { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#0a2027", color: "#fff", padding: "10px 18px", borderRadius: 20, fontSize: 13, zIndex: 60 };
