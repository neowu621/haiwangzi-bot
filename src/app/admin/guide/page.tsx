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
function GroupHeader({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mt-6 mb-3 flex items-baseline gap-3 border-b pb-2" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--color-phosphor)" }}>{children}</h2>
      {hint && <span className="text-[11px]" style={subStyle}>{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-5 mb-4" style={cardStyle}>
      <h3 className="mb-3 text-base font-bold" style={{ color: "#047857" }}>{title}</h3>
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

/** 頁面對照小卡 */
function PageRef({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 my-2">
      {items.map(([path, desc]) => (
        <div key={path} className="flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[11px]" style={{ background: "rgba(255,255,255,0.04)" }}>
          <code className="shrink-0 text-[10px]" style={{ color: "#60a5fa" }}>{path}</code>
          <span style={{ color: "rgba(230,240,255,0.7)" }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 主頁 ─────────────────────────────── */
export default function AdminGuidePage() {
  return (
    <AdminShell title="操作流程說明">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 rounded-xl p-5" style={cardStyle}>
          <h1 className="text-lg font-bold" style={{ color: "#e6f0ff" }}>📖 海王子潛水 — 完整操作說明</h1>
          <p className="mt-1 text-xs" style={subStyle}>
            先看「🗺️ 頁面架構總覽」(前台 / 後台 × 桌機 / 手機 + 裝置分流),再分「前台篇(客戶 / 教練)」與「後台篇(管理用)」,最後「🆕 新功能補充」(手機後台 / 客服信箱 / 願望單 / 網站分析 / 保險 / 外部連結)。
          </p>
          <div className="mt-3"><Legend /></div>
        </div>

        {/* ══════════════ 架構總覽 ══════════════ */}
        <GroupHeader hint="前台 / 後台 × 桌機 / 手機">🗺️ 頁面架構總覽</GroupHeader>

        <Section title="0 裝置自動分流（重要）">
          <DiagramBox title="同一網址,依裝置給不同版面">
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li><b>前台</b> <code style={{ color: "#60a5fa" }}>/</code>：桌機 → 桌機版首頁;<b>手機真人 → 自動轉 <code style={{ color: "#60a5fa" }}>/mobile</code></b>(手機版);搜尋引擎爬蟲留在 <code style={{ color: "#60a5fa" }}>/</code> 給 Google 收錄。內容頁皆 RWD,桌機 / 手機共用。</li>
              <li><b>後台</b> <code style={{ color: "#60a5fa" }}>/admin</code>：螢幕 <b>≤820px 自動轉 <code style={{ color: "#60a5fa" }}>/admin/m</code></b>(手機版 8 大卡);網址加 <code style={{ color: "#60a5fa" }}>?desktop=1</code> 或右上「完整版」可看桌機版。</li>
            </ul>
          </DiagramBox>
        </Section>

        <Section title="0① 四大區塊與主要頁面">
          <div className="text-xs font-bold" style={{ color: "#34d399" }}>🌊 前台官網（公開・Google 可收錄）</div>
          <PageRef items={[
            ["/", "官網首頁(桌機)"],
            ["/mobile", "手機版首頁(手機真人自動到這)"],
            ["/schedule", "日潛場次"],
            ["/course", "課程介紹"],
            ["/pricing", "價格"],
            ["/northsea-diving", "東北角潛點"],
            ["/dive/[潛點]", "單一潛點介紹"],
            ["/haiwangzi", "品牌 / 教練介紹"],
            ["/comment", "學員評價"],
            ["/faq", "常見問題(含保險)"],
            ["/safety", "安全須知 + 保險說明"],
            ["/contact", "線上諮詢 → 進客服信箱"],
          ]} />
          <div className="mt-2 text-xs font-bold" style={{ color: "#34d399" }}>📱 LIFF 會員 App（LINE 內・手機）</div>
          <PageRef items={[
            ["/liff/welcome", "LIFF 入口"],
            ["/liff/calendar", "場次月曆 → 日潛報名"],
            ["/liff/tour", "潛旅報名"],
            ["/liff/wishes/new", "開團許願"],
            ["/liff/my", "我的預約 / 付款 / 退款"],
            ["/liff/profile", "會員中心(VIP / 抵用金)"],
            ["/liff/coach/today", "教練端:今日帶團 / 排班 / 收款"],
          ]} />
          <div className="mt-2 text-xs font-bold" style={{ color: "#60a5fa" }}>🖥 後台桌機 /admin（側欄分組）</div>
          <PageRef items={[
            ["/admin", "總覽(含訪客計數 + GA)"],
            ["/admin/tonight", "老闆結帳"],
            ["/admin/bookings", "訂單管理"],
            ["/admin/users", "會員管理"],
            ["/admin/email", "客服信箱(Email + LINE)"],
            ["/admin/dive-wishes", "願望單"],
            ["/admin/trips", "日潛場次"],
            ["/admin/tours", "潛水旅行"],
            ["/admin/credits", "抵用金"],
            ["/admin/analytics", "網站分析(GA4)"],
            ["/admin/settings", "系統設定(含外部連結)"],
          ]} />
          <div className="mt-2 text-xs font-bold" style={{ color: "#60a5fa" }}>📱 後台手機 /admin/m（8 大卡）</div>
          <PageRef items={[
            ["/admin/m", "手機後台首頁(8 卡 + 訪客數)"],
            ["/admin/m/tonight", "老闆結帳"],
            ["/admin/m/bookings", "訂單"],
            ["/admin/m/dive-wishes", "願望單"],
            ["/admin/m/email", "客服信箱"],
            ["/admin/m/trips", "日潛場次"],
            ["/admin/m/users", "會員"],
            ["/admin/m/tours", "潛旅"],
            ["/admin/m/credits", "抵用金"],
          ]} />
        </Section>

        {/* ══════════════ 前台篇 ══════════════ */}
        <GroupHeader hint="客戶 / 教練在 LINE LIFF 內操作">🌊 前台篇</GroupHeader>

        <Section title="前① 客戶完整旅程">
          <DiagramBox title="從加好友到成為 VIP">
            <VFlow>
              <Node color="blue">加 LINE 官方帳號好友</Node>
              <ArrowDown label="自動建會員 + 發 50 元註冊抵用金（LV1）" />
              <Node color="muted">瀏覽行程</Node>
              <ArrowDown label="3 種管道擇一" />
              <Branch labels={["有日期", "想跟團", "找不到日期"]}>
                <Node color="phosphor" small>一日潛水</Node>
                <Node color="phosphor" small>潛水旅行</Node>
                <Node color="amber" small>提願望單</Node>
              </Branch>
              <ArrowDown label="下單 → 付款 → 上傳轉帳截圖" />
              <Node color="purple">老闆審核憑證 → 確認</Node>
              <ArrowDown label="當天到場，教練勾選簽到完成" />
              <Node color="phosphor">海王子潛次 +1 → 累積升 VIP / 領升等獎勵</Node>
            </VFlow>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>客戶全程在 <b>LINE 內</b>操作，不需另外下載 App。</li>
            <li>首次完成付款 + Email 已驗證 → 自動再送 <b>100 元首單獎勵</b>（一人一次）。</li>
          </ul>
        </Section>

        <Section title="前② 三種預約管道">
          <PageRef items={[
            ["/liff/calendar", "一日潛水行事曆（本週 / 近兩週），點場次進預約"],
            ["/liff/tour", "潛水旅行團列表 → 點團報名"],
            ["/liff/wishes/new", "願望單：找不到合適日期，自己提想去的日期"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>一日潛水</b>：選日期 → 選場次（含夜潛）→ 填參加者 / 裝備租借 → 同意政策 + 手寫簽名 → 送出。<b>場次開始前 2 小時截止</b>，過了會變灰、不能點。</li>
            <li><b>潛水旅行</b>：看團詳情（行程、潛點、費用、繳費期限）→ 報名 → 付訂金。</li>
            <li><b>願望單</b>：客戶提出想潛的日期 / 型態 → 老闆在後台回覆討論 → 喬好後直接開場次或轉訂單。</li>
          </ul>
        </Section>

        <Section title="前③ 付款與憑證上傳">
          <DiagramBox title="付款流程">
            <VFlow>
              <Node color="blue">下單成功（未付款）</Node>
              <ArrowDown label="我的預約 → 付款方式選擇" />
              <Branch labels={["轉帳", "LINE Pay", "其他"]}>
                <Node color="muted" small>🏦 銀行轉帳</Node>
                <Node color="muted" small>💚 LINE Pay</Node>
                <Node color="muted" small>📝 其他</Node>
              </Branch>
              <ArrowDown label="上傳轉帳 / 付款截圖" />
              <Node color="amber">待老闆審核（awaiting_verify）</Node>
              <ArrowDown />
              <Node color="phosphor">老闆核可 → 訂單確認</Node>
            </VFlow>
          </DiagramBox>
          <PageRef items={[
            ["/liff/payment/[id]", "付款方式選擇 + 上傳憑證"],
            ["/pay/[id]?t=token", "公開付款頁（免 LINE 登入，可轉傳）"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>已全面取消「現場支付」，一律事先轉帳 / LINE Pay。</li>
            <li>截圖會自動壓縮（目標 &lt; 500KB）再上傳。</li>
          </ul>
        </Section>

        <Section title="前④ 我的預約 / 退款">
          <PageRef items={[
            ["/liff/my", "我的預約：看所有訂單狀態、付款、同意聲明"],
            ["/liff/refund-request/new", "自助發起退款申請"],
            ["/liff/refund/[id]", "退款確認（老闆發起後客戶確認）"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>退款<b>兩段式</b>：客戶申請或老闆發起 → 對方確認 → 執行（可退現金或轉抵用金）。</li>
            <li>每筆訂單可隨時查看當初簽署的「同意聲明」。</li>
          </ul>
        </Section>

        <Section title="前⑤ 會員中心（個人 / VIP / 抵用金）">
          <PageRef items={[
            ["/liff/profile", "個人中心：VIP 等級、抵用金餘額、Email 驗證、個資"],
            ["/liff/faq", "常見問題 / 關於海王子 / 退款 / 安全政策"],
            ["/liff/media", "最新動態（活動 / 影片）"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>VIP 等級<b>只看「海王子累積潛次」</b>（到場簽到才 +1），自填的總經驗不算。</li>
            <li>等級：🦐LV1(0) → 🦞LV2(21) → 🐢LV3(51) → 🪼LV4(101) → 🐋LV5(201)。每升一級自動發升等獎勵抵用金。</li>
            <li>進場 / 預約前若缺電話 / Email 會跳「補資料」視窗，Email 需點驗證信完成驗證才算數。</li>
          </ul>
        </Section>

        <Section title="前⑥ 教練端 LIFF">
          <PageRef items={[
            ["/liff/coach/today", "今日帶團名單 + 到場勾選（簽到 → 潛次 +1）"],
            ["/liff/coach/schedule", "教練排班 / 行程"],
            ["/liff/coach/payment", "教練收款 / 核對"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>教練「勾選簽到完成」是 VIP 潛次累積的<b>唯一來源</b>，務必當天確實勾選。</li>
          </ul>
        </Section>

        {/* ══════════════ 後台篇 ══════════════ */}
        <GroupHeader hint="管理者操作 — 側欄由上而下的建議分組">🛠️ 後台篇</GroupHeader>

        <Section title="後① 即時營運（每天必看）">
          <PageRef items={[
            ["/admin", "總覽：本月收入、待辦、關鍵指標"],
            ["/admin/tonight", "老闆結帳：當天到場名單 → 逐筆 / 批次結算收款"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>老闆結帳</b>是每天打烊前的主畫面：兩段式（先點名到場 → 再批次結算），確認每筆都收齊。</li>
          </ul>
        </Section>

        <Section title="後② 訂單生命週期（最關鍵）">
          <DiagramBox title="從下單到結算">
            <VFlow>
              <Node color="blue">客戶 LIFF 下單</Node>
              <ArrowDown label="status / paymentStatus = pending" />
              <Node color="amber">待付款</Node>
              <ArrowDown label="客戶上傳憑證" />
              <Node color="amber">awaiting_verify（待你審核）</Node>
              <ArrowDown label="老闆核可" />
              <Node color="phosphor">confirmed（已確認）</Node>
              <ArrowDown label="當天到場 → 教練簽到" />
              <Node color="phosphor">completed（已完成，潛次 +1）</Node>
              <Branch labels={["客戶取消 / 未到", "逾期未付"]}>
                <Node color="coral" small>cancelled</Node>
                <Node color="coral" small>cancelled_unpaid</Node>
              </Branch>
            </VFlow>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>訂單管理頁可用狀態 chips 篩選；場次列有 4 時段快捷。</li>
            <li>每筆訂單有完整狀態歷史（誰、何時、改成什麼）。</li>
          </ul>
        </Section>

        <Section title="後③ 商品管理（場次 / 潛旅 / 教練）">
          <PageRef items={[
            ["/admin/trips", "日潛場次：新增 / 編輯 / Dump 一週、夜潛、預設定價"],
            ["/admin/tours", "潛水旅行團：行程、潛點、費用、繳費期限"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>潛旅<b>訂金截止＝每位客人下訂後 7 天</b>（動態）；<b>尾款截止＝出發前 30 天</b>（編輯頁可一鍵帶入）。</li>
            <li>有訂單的場次 / 團不能直接硬刪，要先處理訂單。</li>
          </ul>
        </Section>

        <Section title="後④ 客戶與會員">
          <PageRef items={[
            ["/admin/users", "會員管理：資料、VIP、最後活躍、軟 / 硬刪、黑名單"],
            ["/admin/dive-wishes", "願望單：回覆討論 → 開場次 / 轉訂單"],
            ["/admin/credits", "抵用金管理：發放 / 調整 / 查交易明細"],
            ["/admin/settings?tab=vip", "⭐ VIP：等級門檻、升級獎勵、福利"],
          ]} />
          <DiagramBox title="會員刪除選項">
            <Branch labels={["推薦", "不可逆"]}>
              <Node color="amber">🗃️ 軟刪除（封存）</Node>
              <Node color="coral">🗑 永久刪除</Node>
            </Branch>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>軟刪除</b>：無法登入但訂單 / 付款保留，可還原（推薦）。</li>
            <li><b>永久刪除</b>：會員 + 訂單 + 付款憑證全消失，不可逆。</li>
            <li><b>黑名單</b>：可登入但無法預約（與封存不同）。</li>
            <li>VIP 升等獎勵是<b>系統自動</b>發放（經辦人顯示 🤖 系統發），不歸在任何管理員名下。</li>
          </ul>
        </Section>

        <Section title="後⑤ 付款憑證審核（最常被遺漏）">
          <DiagramBox title="憑證生命週期">
            <VFlow>
              <Node color="blue">客戶上傳截圖</Node>
              <ArrowDown />
              <Branch labels={["核可", "駁回"]}>
                <Node color="phosphor" small>✅ 訂單確認 + 計收款</Node>
                <Node color="coral" small>✗ 退回（保留紀錄，請客戶重傳）</Node>
              </Branch>
              <ArrowDown label="已核可滿 30 天" />
              <Node color="muted">自動從 R2 刪圖（省空間，紀錄留存）</Node>
            </VFlow>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>有待審憑證時務必盡快處理，否則訂單卡在 awaiting_verify。</li>
            <li>憑證有「訂金 / 尾款 / 退款」標籤分類。</li>
          </ul>
        </Section>

        <Section title="後⑥ 行銷與通知">
          <PageRef items={[
            ["/admin/media-posts", "最新動態：手動發活動 / 影片到前台"],
            ["/admin/templates", "訊息模板：各種通知的預設文字"],
            ["/admin/broadcast", "群發通知：選對象 + 管道（LINE / Email）一次送"],
          ]} />
          <DiagramBox title="💰 自動付款提醒時間軸（系統，每筆每段只發一次）">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md p-3" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.25)" }}>
                <div className="mb-1 text-xs font-bold" style={{ color: "#60a5fa" }}>🔱 一日潛水</div>
                <ul className="space-y-1 text-[11px]" style={{ color: "rgba(230,240,255,0.8)" }}>
                  <li>📋 下訂後第 <b>2 天</b>未付 → 提醒</li>
                  <li>🚨 第 <b>7 天</b> → 最後通知</li>
                  <li>⚠️ 第 <b>10 天</b> → 自動取消</li>
                </ul>
              </div>
              <div className="rounded-md p-3" style={{ background: "rgba(99,235,164,0.06)", border: "1px solid rgba(99,235,164,0.25)" }}>
                <div className="mb-1 text-xs font-bold" style={{ color: "#047857" }}>🚢 潛水旅行</div>
                <ul className="space-y-1 text-[11px]" style={{ color: "rgba(230,240,255,0.8)" }}>
                  <li>💰 下訂後第 <b>5 天</b>訂金未付 → 催繳</li>
                  <li>🛟 出發前 <b>33 天</b> → 尾款預告</li>
                  <li>🛟 出發前 <b>30 天</b> → 尾款催繳</li>
                  <li>📘 出發前 <b>2 天</b> → 行前手冊</li>
                </ul>
              </div>
            </div>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>所有 LINE / Email 通知結尾自動附上 FB / YT / IG 連結。</li>
            <li>每日天氣回報、每晚 21:00 明日預報，可在「系統設定 → 📨 發送」設定收件人。</li>
          </ul>
        </Section>

        <Section title="後⑦ 分析與紀錄">
          <PageRef items={[
            ["/admin/reports", "報表：收入 / 場次 / 訂單 / 會員 + CSV 匯出"],
            ["/admin/customer-activity", "前台活動：客戶瀏覽 / 操作軌跡（含 IP / UA）"],
            ["/admin/audit-logs", "操作紀錄：所有管理動作 + 群發 / 聯絡客戶歷史"],
          ]} />
        </Section>

        <Section title="後⑧ 系統設定（各分頁）">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>🏠 首頁</b>：Hero 文字、海況卡、footer。</li>
            <li><b>🔗 連結</b>：FB / YT / IG（會自動附到所有通知）。</li>
            <li><b>💳 付款</b>：銀行帳號、LINE Pay ID（a26463030）。</li>
            <li><b>💰 金額</b>：裝備租借費率、教練費、生日金、天氣風速門檻。</li>
            <li><b>⭐ VIP</b>：等級門檻 + 升級獎勵（＝升等金額，集中在這）。</li>
            <li><b>📤 上傳 / 📜 政策 / 📨 發送（自動通知）/ ⚠️ 危險 / 🔧 工具</b>。</li>
          </ul>
        </Section>

        <Section title="後⑨ 自動化排程（Cronicle 觸發）">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><code>/api/cron/payment-reminders</code> — 【日潛】D+2 / D+7 / D+10 自動取消</li>
            <li><code>/api/cron/reminders</code> — 【潛旅】訂金催繳 + 尾款兩段 + 行前手冊 + 日潛 D-1</li>
            <li><code>/api/cron/weather-check</code> — 風速超標自動取消場次</li>
            <li><code>/api/cron/birthday-credits</code> — 生日會員發抵用金</li>
            <li>每日訂單日報、願望單自動關閉、活動完成、憑證清理等亦由排程處理。</li>
          </ul>
        </Section>

        <Section title="後⑩ 危險操作（系統設定 → ⚠️ 危險）">
          <DiagramBox title="兩種重置對照">
            <Branch labels={["保留會員 + 設定", "幾乎全清"]}>
              <Node color="amber">營運資料重置</Node>
              <Node color="coral">系統初始重置</Node>
            </Branch>
          </DiagramBox>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>需輸入確認字串才執行，<b>不可復原</b>，操作前務必確認。</li>
          </ul>
        </Section>

        <Section title="後⑪ 常見問題排查">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>訂單卡 awaiting_verify</b>？→ 付款憑證有待審，去核可 / 駁回。</li>
            <li><b>客戶說沒收到提醒</b>？→ 確認他通知開關（LINE / Email）+ 該段提醒「提醒日是否＝今天」。</li>
            <li><b>VIP 等級怪怪的</b>？→ 看「海王子潛次」而非自填總經驗；存一次 VIP 設定會全員重算。</li>
            <li><b>場次點不進去</b>？→ 開始前 2 小時已截止，屬正常。</li>
            <li><b>部署後版本沒更新</b>？→ 看後台左下角 v 版號 / <code>/api/healthz</code>。</li>
          </ul>
        </Section>

        {/* ══════════════ 新功能補充 ══════════════ */}
        <GroupHeader hint="近期新增的功能">🆕 新功能補充</GroupHeader>

        <Section title="新① 手機後台（/admin/m）">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>手機開 <code>/admin</code> 會<b>自動進手機版 <code>/admin/m</code></b>（8 大卡:老闆結帳 / 訂單 / 願望單 / 客服信箱 / 日潛 / 會員 / 潛旅 / 抵用金）。</li>
            <li>每張子頁最上面有「<b>← 首頁</b>」可一鍵回手機後台首頁;右上「<b>完整版</b>」切桌機。</li>
            <li>常用動作可就地做(確認收款 / 回覆客服 / 發抵用金);複雜編輯仍深連桌機。</li>
          </ul>
        </Section>

        <Section title="新② 客服信箱（Email + LINE 整合）">
          <PageRef items={[
            ["/admin/email", "統一收件匣:網站諮詢 / Email / LINE 客人訊息"],
            ["/contact", "客戶端線上諮詢表單(送出即進信箱 + 通知老闆)"],
          ]} />
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>客戶從 <code>/contact</code> 送出 → 自動<b>通知老闆(LINE + Email)</b> + 寄<b>自動回覆</b>給客戶。</li>
            <li>LINE 客人傳訊也會進信箱(💬 標記),可在後台<b>直接用官方帳號回覆</b>;Email 來信則以 Email 回。</li>
            <li>支援安全的 HTML 信件閱讀(沙箱)+ 回覆。</li>
          </ul>
        </Section>

        <Section title="新③ 願望單（找不到日期時客戶自提）">
          <PageRef items={[
            ["/admin/dive-wishes", "願望單管理:回覆 / 開場次 / 轉訂單"],
            ["/liff/wishes/new", "客戶端提願望"],
          ]} />
          <p className="text-xs">客戶提想潛的日期 / 型態 → 後台回覆討論 → 喬好後直接開場次或轉訂單。手機版 <code>/admin/m/dive-wishes</code> 可就地回覆。</p>
        </Section>

        <Section title="新④ 網站分析（訪客計數 + Google Analytics）">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>即時計數(自建)</b>:後台總覽左卡顯示今日 / 近 7 天訪客 + <b>近 24 小時曲線</b>。隱私友善,只存每天 / 每小時總數,<b>後台自己的瀏覽不計</b>。</li>
            <li><b>Google Analytics(近 30 天)</b>:總覽右卡;點「詳細分析」進 <code>/admin/analytics</code> 看訪客趨勢 / 熱門頁 / 來源 / 裝置(需先在 analytics 頁連接 Google 授權)。</li>
          </ul>
        </Section>

        <Section title="新⑤ 保險提醒（下訂後引導加保個人海域險）">
          <p className="text-xs">客戶下訂後,在<b>訂單成功頁 / 確認 Email / LINE 確認訊息</b>都會出現「建議自行加保個人海域險(富邦第1類)」+ 投保連結;<code>/safety</code> 與 <code>/faq</code> 也有保險說明。文案集中在 <code>lib/insurance.ts</code>,改一處全站同步。</p>
        </Section>

        <Section title="新⑥ 官網外部連結 + Google 後台登入">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><b>外部連結</b>(系統設定 → 外部連結):官方網站 / FB / YouTube / IG / LINE QR。其中<b>官網會自動附在每封 Email 與 LINE 訊息結尾</b>。</li>
            <li><b>Google / LINE 後台登入</b>:<code>/admin/login</code> 可用 Google 或 LINE 快速登入(僅限 admin / 老闆;Email 須與帳號相符)。</li>
          </ul>
        </Section>
      </div>
    </AdminShell>
  );
}
