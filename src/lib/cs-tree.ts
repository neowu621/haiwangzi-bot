// v903：站內客服「引導問題樹」資料 —— 沿用 FAQ 內容的精簡版（給快速自助解答用）。
//   前端 /liff/messages 顯示；每個問題有穩定 key，供事件記錄與後台統計。
//   內容若要調整，改這裡即可（分類/問題/答案）。

export interface CsTreeItem {
  key: string; // 穩定鍵（統計用，勿隨意改）
  q: string;
  a: string;
}
export interface CsTreeCategory {
  key: string;
  emoji: string;
  label: string;
  items: CsTreeItem[];
}

export const CS_TREE: CsTreeCategory[] = [
  {
    key: "book", emoji: "🗓", label: "預約 / 取消 / 退款",
    items: [
      { key: "book.how", q: "怎麼預約日潛 / 潛水團？", a: "底部「潛水預約」分頁挑場次或行程 → 填人數、選付款方式 → 送出。完成後系統會自動發 LINE 確認訊息。" },
      { key: "book.friends", q: "可以幫朋友 / 家人一起報名嗎？", a: "可以！預約時「人數」填總人數，系統會請你填每位參加者的姓名、緊急聯絡與證照。常一起潛的朋友可存「同伴清單」，下次一鍵帶入。" },
      { key: "book.cancel", q: "可以取消嗎？退款規則？", a: "可以，退款依取消天數而定（詳見「常見問題 → 取消政策」）。若因天氣取消，店家會協助退款或轉抵用金，不影響其他天的預約。" },
    ],
  },
  {
    key: "pay", emoji: "💳", label: "付款 / 抵用金",
    items: [
      { key: "pay.methods", q: "有哪些付款方式？", a: "🏦 銀行轉帳、💚 LINE Pay、📝 其他（街口/微信…）。下訂後到「我的預約 → 付款方式選擇」依方式填寫並上傳證明。" },
      { key: "pay.when", q: "什麼時候要付清？", a: "預約後到出發前都可付，建議 7 天內完成。超過 10 天未付會自動催繳；老闆審核付款證明後訂單正式確認（通常 24 小時內）。" },
      { key: "pay.split", q: "可以分次付款嗎？", a: "可以。潛水團分「訂金 + 尾款」兩階段；日潛也可分批匯款，每次到付款頁上傳即可。" },
      { key: "pay.wrongproof", q: "付款證明傳錯了怎麼辦？", a: "到「我的預約 → 付款方式選擇」：未審核的可刪除重傳、已駁回的看老闆說明再傳、已核可的不可更動（有疑問請問老闆）。" },
      { key: "pay.credit", q: "抵用金是什麼？怎麼用？", a: "NT$ 1:1 的折抵點數，來源有註冊禮金、首單獎勵、生日、VIP 回饋、退款轉入等。預約時勾「使用抵用金折抵」即可折抵。" },
    ],
  },
  {
    key: "day", emoji: "🤿", label: "潛水當天（帶什麼 / 裝備 / 天氣）",
    items: [
      { key: "day.bring", q: "需要帶什麼？", a: "健保卡、個人換洗衣物、個人裝備（要租的話最晚潛水日 2 天前登記）。潛完可到打氣站用熱水沖洗 🚿。" },
      { key: "day.rental", q: "可以租借裝備嗎？費用？", a: "可以，預約時勾選需要的裝備，最晚潛水日 2 天前登記。費率見預約頁，整套租借有優惠。" },
      { key: "day.weather", q: "當天天氣不好怎麼辦？", a: "風速超過安全門檻會在前一天或當天早上發訊息通知取消，可退款或轉抵用金，不影響其他天的預約。" },
    ],
  },
  {
    key: "vip", emoji: "⭐", label: "VIP 會員等級",
    items: [
      { key: "vip.levels", q: "有幾級？怎麼升等？", a: "共 5 級，依累積潛次自動升：🦐 小蝦 → 🦞 龍蝦(11) → 🐢 海龜(51) → 🦈 鬼蝠魟(101) → 🐋 鯨鯊(201)。一場 3 氣瓶 = 3 潛。" },
      { key: "vip.reward", q: "升等有獎勵嗎？", a: "有！每次跨級升等會發抵用金；另外註冊(Email 驗證)、首次潛水、生日當月也都有機會拿抵用金。金額依營運調整。" },
      { key: "vip.perks", q: "VIP 有什麼福利？", a: "裝備租借折扣、回饋抵用金等，下單時依你當前等級自動套用並顯示。目前等級可在「個人」分頁查看。" },
    ],
  },
  {
    key: "safe", emoji: "🛟", label: "安全 / 保險",
    items: [
      { key: "safe.notice", q: "潛水安全與保險須知", a: "請務必詳閱潛水安全與保險須知（完整內容在「常見問題 → 安全注意事項」）。有身體狀況或用藥請務必於報名時告知教練。" },
    ],
  },
];

// 快速查表（統計顯示問題文字用）
export const CS_TREE_LABELS: Record<string, string> = Object.fromEntries(
  CS_TREE.flatMap((c) => [
    [c.key, `${c.emoji} ${c.label}`] as [string, string],
    ...c.items.map((it) => [it.key, it.q] as [string, string]),
  ]),
);
