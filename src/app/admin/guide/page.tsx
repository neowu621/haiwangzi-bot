"use client";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { ChevronRight } from "lucide-react";

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.7)" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-5 mb-4" style={cardStyle}>
      <h2 className="mb-3 text-base font-bold" style={{ color: "var(--color-phosphor)" }}>{title}</h2>
      <div className="space-y-3 text-sm" style={subStyle}>{children}</div>
    </section>
  );
}

function FlowNode({ children, color = "phosphor" }: { children: React.ReactNode; color?: "phosphor" | "amber" | "coral" | "blue" | "muted" }) {
  const colorMap: Record<typeof color, { bg: string; text: string }> = {
    phosphor: { bg: "rgba(99,235,164,0.15)", text: "var(--color-phosphor)" },
    amber: { bg: "rgba(255,191,0,0.15)", text: "#fbbf24" },
    coral: { bg: "rgba(255,123,90,0.15)", text: "var(--color-coral)" },
    blue: { bg: "rgba(96,165,250,0.15)", text: "#60a5fa" },
    muted: { bg: "rgba(255,255,255,0.07)", text: "rgba(230,240,255,0.6)" },
  };
  const c = colorMap[color];
  return (
    <span className="inline-block rounded-md px-2 py-1 text-xs font-semibold" style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
}

function Flow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 my-2">{children}</div>;
}

function Arrow() {
  return <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "rgba(230,240,255,0.4)" }} />;
}

export default function AdminGuidePage() {
  return (
    <AdminShell title="操作流程說明">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 rounded-xl p-5" style={cardStyle}>
          <h1 className="text-lg font-bold" style={{ color: "#e6f0ff" }}>📖 海王子潛水後台 — 操作流程說明</h1>
          <p className="mt-1 text-xs" style={subStyle}>
            這份文件整理會員、訂單、場次、潛水團之間的關係與生命週期，協助新接手的管理員快速上手。
          </p>
        </div>

        {/* ── 會員生命週期 ────────────────────── */}
        <Section title="① 會員生命週期">
          <p>會員的狀態流轉：</p>
          <Flow>
            <FlowNode color="blue">註冊（加 LINE 好友）</FlowNode>
            <Arrow />
            <FlowNode color="phosphor">活躍會員</FlowNode>
            <Arrow />
            <FlowNode color="amber">封存（軟刪除）</FlowNode>
            <Arrow />
            <FlowNode color="coral">永久刪除</FlowNode>
          </Flow>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>註冊</b>：使用者加 LINE OA <code>@894bpmew</code> 為好友 → 系統自動建立 User row + 生成會員編號 <code>M{`{date}-{XX}`}</code></li>
            <li><b>活躍</b>：可登入 LIFF、預約場次、累積消費與潛水次數，依規則升等 VIP</li>
            <li><b>封存（軟刪除）</b>：✅ <b>推薦</b>。會員無法登入 LIFF，但<b>所有訂單與付款紀錄保留</b>。可隨時還原</li>
            <li><b>永久刪除</b>：⚠️ 整筆會員 + 訂單 + 付款憑證 + 提醒紀錄全部消失。<b>有付款紀錄者建議用封存而非刪除</b>（財務查帳需求）</li>
          </ul>
          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,191,0,0.08)", color: "#fbbf24" }}>
            🔑 規則：黑名單與封存不同。黑名單會員無法預約但仍可登入；封存會員直接無法登入。
          </p>
        </Section>

        {/* ── 訂單生命週期 ────────────────────── */}
        <Section title="② 訂單生命週期（最關鍵的流程）">
          <p>訂單從建立到結算的完整流程：</p>
          <div className="rounded-md p-3 my-2" style={{ background: "rgba(0,0,0,0.2)" }}>
            <div className="text-xs space-y-3">
              <div>
                <b style={{ color: "#60a5fa" }}>1. 下單</b>
                <Flow>
                  <FlowNode color="muted">客戶 LIFF 預約</FlowNode>
                  <Arrow />
                  <FlowNode color="amber">status=pending, paymentStatus=pending</FlowNode>
                </Flow>
              </div>
              <div>
                <b style={{ color: "#60a5fa" }}>2. 付款（場次前）</b>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><b>現場支付</b>（cash）：LV2+ 才能用，當天現場結算</li>
                  <li><b>銀行轉帳</b>（bank）：客戶上傳轉帳截圖 → admin 在訂單編輯 dialog 看憑證 → 一鍵核可入帳</li>
                  <li><b>LINE Pay</b>（linepay）：同 bank 流程，差別只在 paymentMethod 標記</li>
                </ul>
                <p className="text-[11px] mt-1 opacity-70">⚠️ LV1 會員不能用「現場支付」，必須出發前 3 天付清</p>
              </div>
              <div>
                <b style={{ color: "#60a5fa" }}>3. 場次當天 — 結算</b>
                <Flow>
                  <FlowNode color="phosphor">✓ 已完成</FlowNode>
                  <FlowNode color="coral">✗ 未到場</FlowNode>
                  <FlowNode color="muted">已取消</FlowNode>
                </Flow>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><b>已完成</b>：客戶到場，admin 點「✓ 完成」按鈕 → 累計潛水次數（=氣瓶數）+ 重算 VIP</li>
                  <li><b>未到場</b>：點「✗ 未到場」→ 三選一處理已付款（不退 / 退現 100% / 轉禮金自訂 %）</li>
                  <li><b>已取消</b>：客戶或天氣取消 → 進入退款流程</li>
                </ul>
              </div>
              <div>
                <b style={{ color: "#60a5fa" }}>4. 退款處理</b>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><b>退現金 100%</b>：admin 線下退錢 + 系統記錄</li>
                  <li><b>轉禮金 N%</b>：直接存到客戶禮金餘額，下次預約折抵</li>
                  <li><b>天氣取消推薦：轉禮金 110%</b>（多 10% 優惠鼓勵留客）</li>
                  <li><b>客戶失約推薦：不退 / 轉禮金 80%</b>（保留違約金）</li>
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
            ⚠️ <b>已收款的訂單千萬不要直接刪除</b>，先退款（退現或轉禮金）再刪除。否則會員的財務紀錄會失蹤。
          </p>
        </Section>

        {/* ── 場次 / 潛水團 ────────────────────── */}
        <Section title="③ 場次與潛水團管理">
          <p>場次（日潛）和潛水團（多日行程）有相同的狀態流：</p>
          <Flow>
            <FlowNode color="phosphor">open 開放預約</FlowNode>
            <Arrow />
            <FlowNode color="amber">cancelled 已取消</FlowNode>
            <Arrow />
            <FlowNode color="coral">永久刪除</FlowNode>
          </Flow>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>新增場次</b>：填日期 / 時間 / 場次狀態 / 潛點 / 教練 / 氣瓶數 / 人數 / 費用</li>
            <li><b>編輯</b>：所有欄位都可改；改 status 為 cancelled 等同於「取消」</li>
            <li><b>🚫 取消（軟）</b>：status → cancelled，場次資料保留。建議當還有未處理訂單時用這個</li>
            <li><b>🗑 永久刪除</b>：整筆消失。<b>API 會自動擋下有活躍訂單的硬刪</b>，必須先把訂單處理完</li>
          </ul>
          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,191,0,0.08)", color: "#fbbf24" }}>
            🔑 <b>有訂單的場次想刪除的標準流程</b>：
            <br />1. 「🚫 取消」場次（軟取消） → 場次狀態變 cancelled，訂單還在
            <br />2. 進「訂單管理」逐筆處理（退款 / 標記完成 / 標記未到場）
            <br />3. 所有訂單都處理完後 → 回場次列表 → 「🗑 永久刪除」
          </p>
        </Section>

        {/* ── 付款憑證流程 ────────────────────── */}
        <Section title="④ 付款憑證審核（最常被遺漏）">
          <Flow>
            <FlowNode color="muted">客戶 LIFF 上傳截圖</FlowNode>
            <Arrow />
            <FlowNode color="amber">PaymentProof.verifiedAt = null</FlowNode>
            <Arrow />
            <FlowNode color="phosphor">admin 核可</FlowNode>
            <Arrow />
            <FlowNode color="phosphor">paidAmount += amount</FlowNode>
          </Flow>
          <ul className="list-disc space-y-1 pl-5">
            <li>客戶在 LIFF 上傳轉帳截圖 → 存到 R2，DB 記 imageKey + amount + type（訂金/尾款）</li>
            <li>儀表板紅色 banner「N 筆付款待審核」會點到 /admin/bookings 提醒</li>
            <li>進訂單編輯 dialog → 「📄 付款憑證」區看每張縮圖</li>
            <li>點「✓ 核可入帳」→ 系統自動累加 paidAmount、更新 paymentStatus、累計 totalSpend、重算 VIP</li>
            <li>點「✗ 拒絕」→ 刪掉這筆 proof（客戶可重新上傳）</li>
            <li>✅ 已核可的憑證 30 天後 cron 自動清掉 R2 物件（DB 紀錄保留，imageKey 變空）</li>
          </ul>
        </Section>

        {/* ── VIP 等級規則 ────────────────────── */}
        <Section title="⑤ VIP 等級與獎勵">
          <ul className="list-disc space-y-1 pl-5">
            <li>5 級 VIP：🦐 小蝦（LV1） → 🦞 龍蝦（LV2） → 🐢 海龜（LV3） → 🦇 蝙蝠魟（LV4） → 🦈 鯨鯊（LV5）</li>
            <li><b>潛水次數計算</b>：客戶來潛一個場次（標記 completed），<b>+ trip.tankCount</b>（一場 3 氣瓶 = +3 次）</li>
            <li><b>升等門檻</b>：潛水次數 <i>或</i> 累計消費 任一達到即升等</li>
            <li><b>升等獎勵</b>：跨等級自動發禮金到 creditBalance（金額由 /admin/settings 的「VIP 升等獎金」設定）</li>
            <li><b>生日禮金</b>：生日當月自動發 100 元（每年只發一次）</li>
            <li><b>VIP 等級門檻可在 /admin/vip-tiers 調整</b>（儲存後系統會重算所有會員等級）</li>
          </ul>
        </Section>

        {/* ── Cron 自動化任務 ────────────────── */}
        <Section title="⑥ 自動化排程（GitHub Actions Cron — 每天 08:00 觸發）">
          <ul className="list-disc space-y-1 pl-5">
            <li><code>/api/cron/lv1-prepay-reminder</code> — LV1 場次 3 天內未付清，自動推 LINE 催繳</li>
            <li><code>/api/cron/cleanup-old-payment-proofs</code> — 清 30 天前已核可的付款憑證（R2 上的圖片）</li>
            <li><code>/api/cron/daily-settlement-reminder</code> — 列出待結算（場次過了還沒標記完成/未到場的）訂單，推 LINE 給 admin</li>
            <li><code>/api/cron/weather-check</code> — 早上抓中央氣象局風速資料，超過門檻自動取消場次 + 通知客戶</li>
            <li><code>/api/cron/reminders</code> — 出發前 D-1 提醒、付款截止前 N 天催繳</li>
            <li><code>/api/cron/birthday-credits</code> — 自動發放本月過生日會員的禮金</li>
          </ul>
        </Section>

        {/* ── 危險操作 ───────────────────────── */}
        <Section title="⑦ 危險操作（系統設定頁）">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>清空資料</b>：刪除所有訂單 / 日潛場次 / 潛水團 / 付款憑證。會員與設定保留</li>
            <li><b>系統初始重置</b>：把系統回到剛部署狀態。<b>清除一切</b>（訂單、場次、教練、潛點、訊息範本、操作紀錄、媒體照片），<b>並把會員 VIP / 累計 / 禮金歸零</b>。保留會員帳號與系統設定（SiteConfig）</li>
            <li>兩者都需要輸入確認字串（防誤觸）</li>
          </ul>
          <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
            ⚠️ 這兩個操作<b>無法復原</b>，操作前請確認 DB 已備份（Zeabur PostgreSQL 每天自動備份，但仍建議手動 dump 一次）
          </p>
        </Section>

        {/* ── 快速問題排查 ────────────────────── */}
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
                <td className="py-2">Zeabur Redeploy（docker-entrypoint 會跑 migrate-safety）</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">儀表板「N 筆付款待審核」但訂單頁空白</td>
                <td className="py-2 pr-2">孤兒 PaymentProof（父訂單已刪）</td>
                <td className="py-2">/admin/settings → 「清理孤兒紀錄」（API：<code>POST /api/admin/reset-data/orphans</code>）</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <td className="py-2 pr-2">客戶說沒收到 LINE 通知</td>
                <td className="py-2 pr-2">客戶未加 OA 好友 / 通知關閉</td>
                <td className="py-2">會員管理檢查 notifyByLine；客戶須先加 <code>@894bpmew</code> 好友才能收推播</td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>
    </AdminShell>
  );
}
