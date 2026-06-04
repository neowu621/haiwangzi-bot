"use client";
import * as React from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.7)" };

/* ── 流程圖元件 ─────────────────────────── */

type NodeColor = "phosphor" | "amber" | "coral" | "blue" | "muted" | "purple";

function Node({
  children,
  color = "muted",
  shape = "box",
  small = false,
}: {
  children: React.ReactNode;
  color?: NodeColor;
  shape?: "box" | "circle" | "diamond";
  small?: boolean;
}) {
  const palette: Record<NodeColor, { bg: string; border: string; text: string }> = {
    phosphor: { bg: "rgba(99,235,164,0.15)", border: "var(--color-phosphor)", text: "var(--color-phosphor)" },
    amber: { bg: "rgba(251,191,36,0.15)", border: "#fbbf24", text: "#fbbf24" },
    coral: { bg: "rgba(255,123,90,0.15)", border: "var(--color-coral)", text: "var(--color-coral)" },
    blue: { bg: "rgba(96,165,250,0.15)", border: "#60a5fa", text: "#60a5fa" },
    purple: { bg: "rgba(167,139,250,0.15)", border: "#a78bfa", text: "#a78bfa" },
    muted: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.2)", text: "rgba(230,240,255,0.7)" },
  };
  const c = palette[color];
  const sizeCls = small ? "px-2 py-1 text-[10px] min-w-[60px]" : "px-3 py-2 text-xs min-w-[90px]";
  const radiusCls = shape === "circle" ? "rounded-full" : "rounded-md";
  return (
    <div
      className={`inline-flex items-center justify-center border font-semibold text-center ${sizeCls} ${radiusCls}`}
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      {children}
    </div>
  );
}

/** 垂直箭頭（可帶標籤） */
function ArrowDown({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center my-0.5">
      <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.2)" }} />
      <svg width="10" height="6" viewBox="0 0 10 6">
        <path d="M 1 0 L 5 5 L 9 0" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
      </svg>
      {label && (
        <div className="text-[9px] mt-0.5 italic" style={{ color: "rgba(230,240,255,0.45)" }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** 垂直 flow 容器 */
function VFlow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-0 my-2">{children}</div>;
}

/** 分支：N 個並排，上方共用一個 join 點 */
function Branch({
  children,
  labels,
}: {
  children: React.ReactNode;
  labels?: string[];
}) {
  const items = React.Children.toArray(children);
  return (
    <div className="w-full my-1">
      {/* 上方 join line */}
      <svg
        width="100%"
        height="20"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <path
          d="M 50 0 L 50 8 L 10 8 L 10 20 M 50 8 L 90 8 L 90 20 M 50 8 L 50 20"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
          fill="none"
          strokeDasharray={items.length === 2 ? "0" : "0"}
        />
      </svg>
      <div className="flex items-start justify-around gap-2">
        {items.map((child, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            {labels?.[i] && (
              <div
                className="text-[9px] mb-1 italic"
                style={{ color: "rgba(230,240,255,0.5)" }}
              >
                {labels[i]}
              </div>
            )}
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 圖例 */
function Legend() {
  return (
    <div className="flex flex-wrap gap-2 mb-3 text-[10px]" style={subStyle}>
      <div className="flex items-center gap-1"><Node color="blue" small>起點</Node></div>
      <div className="flex items-center gap-1"><Node color="phosphor" small>正常</Node></div>
      <div className="flex items-center gap-1"><Node color="amber" small>警示</Node></div>
      <div className="flex items-center gap-1"><Node color="coral" small>終止</Node></div>
      <div className="flex items-center gap-1"><Node color="purple" small>動作</Node></div>
    </div>
  );
}

/* ── 章節容器 ───────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-5 mb-4" style={cardStyle}>
      <h2 className="mb-3 text-base font-bold" style={{ color: "#047857" }}>{title}</h2>
      <div className="space-y-3 text-sm" style={subStyle}>{children}</div>
    </section>
  );
}

function DiagramBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-4 my-3" style={{ background: "rgba(0,0,0,0.25)", border: "1px dashed rgba(255,255,255,0.1)" }}>
      {title && <div className="mb-2 text-xs font-semibold" style={{ color: "rgba(230,240,255,0.6)" }}>📊 {title}</div>}
      {children}
    </div>
  );
}

/* ── 主頁 ─────────────────────────────── */
export default function AdminGuidePage() {
  return (
    <AdminShell title="操作流程說明">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 rounded-xl p-5" style={cardStyle}>
          <h1 className="text-lg font-bold" style={{ color: "#e6f0ff" }}>📖 海王子潛水後台 — 操作流程說明</h1>
          <p className="mt-1 text-xs" style={subStyle}>
            這份文件用流程圖整理會員、訂單、場次、潛水團之間的關係與生命週期。
          </p>
          <div className="mt-3">
            <Legend />
          </div>
        </div>

        {/* ── ① 會員生命週期 ────────────────────── */}
        <Section title="① 會員生命週期">
          <DiagramBox title="會員狀態流轉">
            <VFlow>
              <Node color="blue">客戶加 LINE OA 為好友</Node>
              <ArrowDown label="系統自動建 User row + 生成編號 M{date}-{XX}" />
              <Node color="phosphor">活躍會員（可登入 LIFF / 預約 / 累積 VIP）</Node>
              <ArrowDown label="admin 操作" />
              <Branch labels={["軟刪除（推薦）", "硬刪除（不可逆）"]}>
                <Node color="amber">🗃️ 封存</Node>
                <Node color="coral">🗑 永久刪除</Node>
              </Branch>
              <div className="mt-3 grid grid-cols-2 gap-3 w-full">
                <div className="flex flex-col items-center">
                  <ArrowDown label="無法登入但訂單還在" />
                  <Node color="phosphor" small>↺ 還原</Node>
                  <ArrowDown />
                  <Node color="phosphor" small>活躍會員</Node>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowDown label="連訂單+付款憑證一起刪" />
                  <Node color="coral" small>完全消失</Node>
                </div>
              </div>
            </VFlow>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>軟刪除（封存）</b>：✅ 推薦。會員無法登入 LIFF，但<b>訂單與付款紀錄保留</b>。隨時可還原</li>
            <li><b>永久刪除</b>：⚠️ 整筆會員 + 訂單 + 付款憑證 + 提醒紀錄全部消失</li>
            <li><b>黑名單</b>：與封存不同 — 黑名單會員「無法預約」但仍可登入；封存會員直接「無法登入」</li>
          </ul>
        </Section>

        {/* ── ② 訂單生命週期 ────────────────────── */}
        <Section title="② 訂單生命週期（最關鍵的流程）">
          <DiagramBox title="從下單到結算的完整流程">
            <VFlow>
              <Node color="blue">客戶 LIFF 預約場次</Node>
              <ArrowDown label="POST /api/bookings/daily" />
              <Node color="amber">status=pending · paymentStatus=pending</Node>
              <ArrowDown label="客戶到「我的預約 → 付款方式選擇」選付款方式" />
              <Branch labels={["全會員", "全會員", "全會員"]}>
                <Node color="muted" small>🏦 轉帳</Node>
                <Node color="muted" small>💚 LINE Pay</Node>
                <Node color="muted" small>📝 其他</Node>
              </Branch>
              <ArrowDown label="客戶上傳付款憑證" />
              <Node color="purple">📄 PaymentProof (verifiedAt=null)</Node>
              <ArrowDown label="Boss 進編輯 dialog 看縮圖" />
              <Branch labels={["金額對", "金額錯/詐騙"]}>
                <Node color="phosphor">✓ 核可入帳</Node>
                <Node color="coral">✗ 拒絕</Node>
              </Branch>
              <ArrowDown label="核可後 paidAmount += amount" />
              <Node color="phosphor">status=confirmed · paymentStatus=fully_paid</Node>
              <ArrowDown label="場次當天" />
              <Branch labels={["客戶到場", "客戶沒來"]}>
                <Node color="phosphor">✓ 已完成</Node>
                <Node color="coral">✗ 未到場</Node>
              </Branch>
              <ArrowDown label="✓ 完成 → logCount += tankCount + VIP 重算" />
              <Node color="purple">VIP 等級可能升等</Node>
              <ArrowDown label="升等 → 自動發抵用金到 creditBalance" />
              <Node color="phosphor">🎁 客戶收升等獎勵</Node>
            </VFlow>
          </DiagramBox>

          <DiagramBox title="退款處理（取消 / 未到場）">
            <VFlow>
              <Node color="amber">訂單需退款</Node>
              <ArrowDown label="Boss 三選一" />
              <Branch labels={["違約沒收", "原路退回", "鼓勵留客"]}>
                <Node color="muted">🅐 不退款</Node>
                <Node color="coral">🅑 退現金 100%</Node>
                <Node color="phosphor">🅒 轉抵用金 N%</Node>
              </Branch>
              <ArrowDown label="C 路線：%可調" />
              <Branch labels={["天氣取消", "客戶失約"]}>
                <Node color="phosphor" small>110%（送 10%）</Node>
                <Node color="amber" small>80%（罰 20%）</Node>
              </Branch>
              <ArrowDown label="記入 user.creditBalance + CreditTx 留紀錄" />
              <Node color="phosphor">下次預約可折抵</Node>
            </VFlow>
          </DiagramBox>

          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
            ⚠️ <b>已收款的訂單不可直接刪除</b>，先退款（退現或轉抵用金）再刪。否則會員財務紀錄會失蹤。
          </p>
        </Section>

        {/* ── ③ 場次 / 潛水團 ────────────────────── */}
        <Section title="③ 場次與潛水團管理">
          <DiagramBox title="場次狀態流轉">
            <VFlow>
              <Node color="blue">admin 新增場次</Node>
              <ArrowDown label="預設 status=open" />
              <Node color="phosphor">🟢 開放（可預約）</Node>
              <ArrowDown label="可能的觸發" />
              <Branch labels={["人滿", "admin 取消", "場次過期", "永久刪"]}>
                <Node color="amber" small>full</Node>
                <Node color="amber" small>cancelled</Node>
                <Node color="muted" small>auto completed</Node>
                <Node color="coral" small>🗑 delete</Node>
              </Branch>
              <ArrowDown label="cancelled / completed 不能改回 open" />
              <Node color="muted">場次結束/取消（但訂單仍在）</Node>
              <ArrowDown label="必須先處理完所有訂單" />
              <Node color="coral">🗑 永久刪除（API 擋有訂單者）</Node>
            </VFlow>
          </DiagramBox>

          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,191,0,0.08)", color: "#fbbf24" }}>
            🔑 <b>有訂單的場次想刪除的標準流程</b>：
            <br />1. 「🚫 取消」場次（軟取消）→ 訂單還在
            <br />2. 進「訂單管理」逐筆處理（退款 / 標完成 / 標未到場）
            <br />3. 訂單全部處理完 → 回場次列表 →「🗑 永久刪除」
          </p>
        </Section>

        {/* ── ④ 付款憑證審核 ────────────────────── */}
        <Section title="④ 付款憑證審核（最常被遺漏的環節）">
          <DiagramBox title="憑證生命週期">
            <VFlow>
              <Node color="blue">客戶 LIFF 上傳轉帳/LINE Pay 截圖</Node>
              <ArrowDown label="檔案存 R2 payments/ bucket（私有）" />
              <Node color="purple">PaymentProof DB row 建立</Node>
              <ArrowDown label="總覽紅色 banner「N 筆待審核」" />
              <Node color="amber">⏳ 等 Boss 審核</Node>
              <ArrowDown label="Boss 進訂單編輯 dialog → 「📄 付款憑證」區" />
              <Node color="muted">看縮圖確認金額是否符合</Node>
              <ArrowDown />
              <Branch labels={["金額正確", "金額錯/可疑"]}>
                <Node color="phosphor">✓ 核可入帳</Node>
                <Node color="coral">✗ 拒絕</Node>
              </Branch>
              <div className="mt-3 grid grid-cols-2 gap-3 w-full">
                <div className="flex flex-col items-center">
                  <ArrowDown label="自動執行" />
                  <Node color="phosphor" small>paidAmount += amount</Node>
                  <ArrowDown />
                  <Node color="phosphor" small>totalSpend += amount</Node>
                  <ArrowDown />
                  <Node color="phosphor" small>重算 VIP 等級</Node>
                  <ArrowDown label="30 天後 cron 清 R2" />
                  <Node color="muted" small>🗃️ 紀錄保留</Node>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowDown label="刪 PaymentProof row" />
                  <Node color="coral" small>客戶可重新上傳</Node>
                </div>
              </div>
            </VFlow>
          </DiagramBox>
        </Section>

        {/* ── ⑤ VIP 升等 ────────────────────── */}
        <Section title="⑤ VIP 等級與獎勵">
          <DiagramBox title="VIP 升等判定">
            <VFlow>
              <Node color="muted">每次訂單 completed</Node>
              <ArrowDown label="trigger" />
              <Node color="purple">累計：logCount += tankCount × participants</Node>
              <ArrowDown label="同時" />
              <Node color="purple">累計：totalSpend += booking.totalAmount</Node>
              <ArrowDown label="比對 SiteConfig.vipTiers 門檻" />
              <Branch labels={["其中一項達標", "都未達標"]}>
                <Node color="phosphor" small>升等！</Node>
                <Node color="muted" small>維持原等級</Node>
              </Branch>
              <ArrowDown label="跨等級各發一次（避免 LV1→3 漏發中間）" />
              <Node color="phosphor">🎁 每跨一階發抵用金到 creditBalance</Node>
            </VFlow>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>5 級：🦐 LV1 → 🦞 LV2 → 🐢 LV3 → 🦇 LV4 → 🦈 LV5</li>
            <li>潛水次數 = 氣瓶數（一場 3 氣瓶 = 3 潛）</li>
            <li>升等門檻：潛水次數 <i>或</i> 累計消費 任一達到即升等</li>
            <li>等級門檻可在 <code>/admin/vip-tiers</code> 調整（儲存後系統會重算所有會員）</li>
          </ul>
        </Section>

        {/* ── ⑥ Cron 排程 ────────────────── */}
        <Section title="⑥ 自動化排程（GitHub Actions Cron — 每天 08:00）">
          <DiagramBox title="每日自動任務">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 my-2">
              <div className="flex flex-col items-center rounded-md p-3" style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <Node color="blue" small>1️⃣</Node>
                <div className="mt-2 text-xs font-semibold text-center" style={{ color: "#60a5fa" }}>LV1 預付款催繳</div>
                <div className="mt-1 text-[10px] text-center" style={subStyle}>場次 3 天內未付清 → LINE 通知</div>
              </div>
              <div className="flex flex-col items-center rounded-md p-3" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)" }}>
                <Node color="purple" small>2️⃣</Node>
                <div className="mt-2 text-xs font-semibold text-center" style={{ color: "#a78bfa" }}>清舊憑證</div>
                <div className="mt-1 text-[10px] text-center" style={subStyle}>30 天前已核可 → R2 刪檔</div>
              </div>
              <div className="flex flex-col items-center rounded-md p-3" style={{ background: "rgba(99,235,164,0.05)", border: "1px solid rgba(99,235,164,0.2)" }}>
                <Node color="phosphor" small>3️⃣</Node>
                <div className="mt-2 text-xs font-semibold text-center" style={{ color: "#047857" }}>結算提醒</div>
                <div className="mt-1 text-[10px] text-center" style={subStyle}>場次過了未結算 → LINE 推 admin</div>
              </div>
            </div>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><code>/api/cron/weather-check</code> — 中央氣象局風速 → 超過門檻自動取消場次</li>
            <li><code>/api/cron/reminders</code> — D-1 提醒、付款催繳</li>
            <li><code>/api/cron/birthday-credits</code> — 本月生日會員自動發抵用金</li>
          </ul>
        </Section>

        {/* ── ⑦ 危險操作 ───────────────────────── */}
        <Section title="⑦ 危險操作（系統設定頁）">
          <DiagramBox title="兩種重置選項對照">
            <div className="grid grid-cols-2 gap-3 my-2">
              <div className="rounded-md p-3" style={{ background: "rgba(255,191,0,0.08)", border: "1px solid rgba(255,191,0,0.3)" }}>
                <Node color="amber">清空資料</Node>
                <div className="mt-2 text-xs space-y-1" style={subStyle}>
                  <div>✗ 訂單 / 場次 / 潛水團 / 付款憑證</div>
                  <div>✓ 會員資料保留</div>
                  <div>✓ 系統設定保留</div>
                  <div>✓ 教練 / 潛點保留</div>
                </div>
              </div>
              <div className="rounded-md p-3" style={{ background: "rgba(255,123,90,0.08)", border: "1px solid rgba(255,123,90,0.3)" }}>
                <Node color="coral">系統初始重置</Node>
                <div className="mt-2 text-xs space-y-1" style={subStyle}>
                  <div>✗ 訂單 / 場次 / 潛水團 / 付款憑證</div>
                  <div>✗ 教練 / 潛點 / 訊息範本</div>
                  <div>✗ 會員 VIP / 累計 / 抵用金歸零</div>
                  <div>✓ 會員帳號保留</div>
                  <div>✓ SiteConfig 保留</div>
                </div>
              </div>
            </div>
          </DiagramBox>
        </Section>

        {/* ── ⑧ 快速排查 ────────────────────── */}
        <Section title="⑧ 快速問題排查">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <th className="py-2 text-left">症狀</th>
                <th className="py-2 text-left">可能原因</th>
                <th className="py-2 text-left">解法</th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">客戶 LIFF 顯示「LIFF login required」</td>
                <td className="py-2 pr-2">LIFF App 設定不對</td>
                <td className="py-2">確認 LINE Console → LIFF → Endpoint URL = <code>https://網域/liff</code></td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">列表顯示「column does not exist」</td>
                <td className="py-2 pr-2">DB schema 沒同步</td>
                <td className="py-2">Zeabur Redeploy（會跑 migrate-safety）</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">儀表板「N 筆付款待審核」但訂單頁空白</td>
                <td className="py-2 pr-2">孤兒 PaymentProof（父訂單已刪）</td>
                <td className="py-2">/admin/settings → 清理孤兒紀錄</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">客戶說沒收到 LINE 通知</td>
                <td className="py-2 pr-2">未加 OA 好友 / 通知關閉 / LV1 限制</td>
                <td className="py-2">會員管理檢查 notifyByLine；客戶須先加 OA 才能收推播</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">場次過期但仍顯示「開放」</td>
                <td className="py-2 pr-2">v113 起前端會自動顯示「已完成」</td>
                <td className="py-2">無需操作。若要永久變更 DB，編輯場次手動改 status</td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>
    </AdminShell>
  );
}
