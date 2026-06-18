// v582：個人海域活動險提醒 —— 下訂後引導客戶「自行加保」個人海域險(富邦,第1類含水肺潛水)。
//   文案定稿原則:只做提醒 + 連結,不細述條款(每人需求不同、以保險條款為準)。
//   兩層保險:① 店家「水域遊憩活動責任保險」(店家已保) ② 個人海域險(建議客戶自行加保)。
export const FUBON_MARINE_URL =
  "https://www.fubon.com/insurance/b2c/content/marine_activity/index.html";
export const INSURANCE_CTA_LABEL = "海域險線上投保《第1類活動》";
export const INSURANCE_DISCLAIMER = "詳細內容依保險條款,請自行洽富邦。";

// ── Email 用(回傳 HTML 片段,沿用品牌信件配色)──────────────
export function insuranceEmailSection(): string {
  return (
    `<div style="margin:20px 0 0 0;padding:14px;background:#eef6f7;border-left:4px solid #0a8f86;border-radius:4px;font-size:13px;line-height:1.7;">` +
    `<b style="color:#0a4f49;">🛟 建議加保個人海域活動險</b><br>` +
    `本店教練已依法投保水域遊憩活動責任保險。為更完整保障您個人安全,建議另行自行投保個人海域險(富邦線上即可投保):<br>` +
    `<a href="${FUBON_MARINE_URL}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;padding:9px 16px;background:#0a8f86;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">${INSURANCE_CTA_LABEL} →</a>` +
    `<div style="margin-top:8px;color:#6b7280;font-size:12px;">${INSURANCE_DISCLAIMER}</div>` +
    `</div>`
  );
}

// ── 純文字 Email / 訊息用 ─────────────────────────────────
export function insuranceTextSection(): string {
  return (
    `\n\n🛟 建議加保個人海域活動險\n` +
    `本店教練已投保水域遊憩活動責任保險;建議您自行加保個人海域險(富邦線上即可投保,第1類含水肺潛水):\n` +
    `${FUBON_MARINE_URL}\n` +
    `${INSURANCE_DISCLAIMER}`
  );
}
