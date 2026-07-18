// v771：AI 小幫手「導引式選單」樹（前端純靜態常數，零 DB / 零 token）。
//   對應資料分層鐵則第 1 層：全域純靜態行銷內容（課程/潛點/潛旅地點/新手 FAQ/預約），
//   內容取自 assistant-kb.ts 的快照，讓客戶用「點選」就能找到答案，不必經過 AI。
//   ⚠️ 會變動的即時資料（場次空位/潛旅團況/後台價目/政策）不要寫死在這裡——
//      標 `live`，widget 直接打既有公開 API（皆有版本號快取，命中零 DB）。

export interface AnswerCard {
  title?: string;
  price?: string;
  bullets?: string[];
  note?: string;
}
export interface MenuLink {
  label: string;
  href: string;
}
/** 需即時查詢的葉節點種類（widget 端對應到既有公開 API）。 */
export type LiveKind =
  | "sessions-weekend"
  | "sessions-2w"
  | "tours"
  | "gear"
  | "cancel"
  | "safety";

export interface MenuNode {
  id: string;
  label: string; // 按鈕文字（可含 emoji）
  intro?: string; // 進入分支時小幫手先說的話
  card?: AnswerCard; // 葉節點：結構化答案卡
  answer?: string; // 葉節點：純文字答案
  live?: LiveKind; // 葉節點：即時查詢（前端打公開 API）
  links?: MenuLink[]; // 答案可附的可點連結（站內相對路徑）
  children?: MenuNode[]; // 分支：子選單
}

export const LINE_URL = "https://line.me/R/ti/p/@894bpmew";

export const ASSISTANT_MENU: MenuNode[] = [
  {
    id: "courses",
    label: "🤿 我想學潛水（課程 / 費用）",
    intro: "好呀🤿 你想了解哪一種？點一個看看：",
    children: [
      {
        id: "course-dsd",
        label: "體驗潛水（免證照）",
        card: {
          title: "體驗潛水（免證照）",
          price: "NT$2,500",
          bullets: [
            "完全沒潛過、不會游泳都可以",
            "教練一對一全程陪同，先在淺水區適應",
            "含全套裝備＋基本水下照相",
            "水下時間約 1.5 小時",
            "確定日期收 50% 訂金；自備泳衣、浴巾、盥洗用品",
          ],
        },
        links: [
          { label: "課程介紹", href: "/#courses" },
          { label: "看場次表", href: "/schedule" },
        ],
      },
      {
        id: "course-ow",
        label: "OW 開放水域考證",
        card: {
          title: "OW 開放水域潛水員（保證班）",
          price: "NT$14,500",
          bullets: [
            "學科 2hr＋泳池 4hr＋海洋實習 2 天（6 支氣瓶）",
            "加贈 1 天 Fun Dive（3 支），共 9 支氣瓶",
            "含教材／氣瓶／裝備／泳池費",
            "地點：學科三重・泳池青年公園・海洋實習東北角",
            "預約制、時間彈性。訂金 NT$6,000，首日繳清尾款",
          ],
        },
        links: [{ label: "課程介紹", href: "/#courses" }],
      },
      {
        id: "course-aow",
        label: "AOW 進階考證",
        card: {
          title: "AOW 進階開放水域潛水員",
          price: "NT$14,500",
          bullets: [
            "學科 2hr＋海洋實習 2 天（6 支）＋贈 1 天 Fun Dive，共 9 支",
            "七大專長：船潛／導航／夜潛／深潛／放流／中性浮力／水推 DPV",
            "含教材／氣瓶／裝備／證照費",
            "加購高氧（Nitrox）證照優惠 NT$3,500，訂金 NT$6,000",
          ],
        },
        links: [{ label: "課程介紹", href: "/#courses" }],
      },
      {
        id: "course-fun",
        label: "持證 Fun Dive（一日潛水）",
        answer:
          "持證朋友的一日潛水依「氣瓶支數」計費（一天通常 3 支），可加租裝備 🤿 我們氣瓶一律採用高氧（Nitrox），下水更輕鬆、停留更久！東北角各潛點每支 NT$600、宜蘭萊萊鶯歌石與石城每支 NT$650，夜潛/船潛另計。加 LINE 說一下需求就給你報價～也可以先看看最近的場次！",
        links: [
          { label: "看場次表", href: "/schedule" },
          { label: "線上詢問", href: "/contact" },
        ],
      },
      {
        id: "course-gear",
        label: "🔖 裝備租借費用（即時）",
        live: "gear",
      },
    ],
  },
  {
    id: "spots",
    label: "🐠 想知道去哪潛（潛點）",
    intro: "東北角好玩的點不少 🐠 想看哪一種？",
    children: [
      {
        id: "spot-northeast",
        label: "東北角熱門潛點",
        card: {
          title: "東北角潛點（可帶體驗 / Fun Dive / 考證）",
          bullets: [
            "龍洞 5–18m｜新手～進階，體驗與考證熱點",
            "深澳（象鼻岩）5–13m｜新手友善、好拍",
            "潮境公園（基隆）約 25m｜新手／Fun Dive",
            "水晶宮 船潛 15–25m｜進階",
            "82.8K 25m+（可達 40m）｜微距天堂、易起流、進階",
            "萊萊鶯歌石｜普遍不深、無強流、Fun Dive",
          ],
        },
        links: [{ label: "潛點介紹", href: "/#spots" }],
      },
      {
        id: "spot-boat",
        label: "船潛路線",
        card: {
          title: "東北角船潛",
          bullets: [
            "基隆嶼彩虹礁、象鼻岩、玫瑰花園",
            "鋼鐵礁、沈船、花牆等",
            "深度約 15–25m",
          ],
        },
        links: [{ label: "潛點介紹", href: "/#spots" }],
      },
    ],
  },
  {
    id: "sessions",
    label: "📅 最近有場次 / 還有位子？",
    intro: "想看哪一段的場次呢？我直接幫你查最新的 📅",
    children: [
      { id: "sess-weekend", label: "本週末的場次（即時）", live: "sessions-weekend" },
      { id: "sess-2w", label: "近兩週的場次（即時）", live: "sessions-2w" },
    ],
  },
  {
    id: "tours",
    label: "🌴 潛水旅行（潛旅）",
    intro: "潛旅團我幫你看看 🌴 要看現在開放的團，還是地點介紹？",
    children: [
      { id: "tour-open", label: "現在開放報名的團（即時）", live: "tours" },
      {
        id: "tour-spots",
        label: "潛旅地點介紹",
        card: {
          title: "常帶的潛旅地點",
          bullets: [
            "綠島（3 天 2 夜）｜能見度常破 20m、大香菇微孔珊瑚，新手～進階",
            "蘭嶼（3 天 2 夜）｜藍洞／洞窟／斷層，進階",
            "小琉球（2 天 1 夜）｜99% 看到海龜、全年適潛，新手首選",
            "菲律賓 媽媽島（4–5 天）｜長尾鯊，進階",
            "菲律賓 薄荷島（5–6 天）｜巴里卡薩大斷層「小西巴丹」",
            "菲律賓 科隆島（5 天 4 夜起）｜二戰沈船、儒艮",
          ],
        },
        links: [{ label: "潛旅行程", href: "/#trips" }],
      },
    ],
  },
  {
    id: "faq",
    label: "😅 新手常見問題",
    intro: "新手最常問的我都整理好了 😄 點一個看看：",
    children: [
      {
        id: "faq-swim",
        label: "不會游泳、會怕，可以嗎？",
        answer:
          "完全可以放心 😄 體驗潛水是小團、教練全程陪同，先在淺水區慢慢適應；裝備有浮力、不會游泳也 OK。任何不舒服比個手勢就慢慢上升，節奏都由你決定，不勉強！",
      },
      {
        id: "faq-ear",
        label: "耳壓會痛嗎？",
        answer:
          "下潛時有壓力感是正常的 🌊 教練會教你「捏鼻子輕輕吐氣」做耳壓平衡，慢慢下潛就不會痛。會不舒服通常是下太快，放慢就好～",
      },
      {
        id: "faq-shark",
        label: "有鯊魚嗎？危險嗎？",
        answer:
          "東北角以珊瑚、熱帶魚、偶爾遇到海龜為主 🐠 不主動去碰海洋生物就很安心，跟著教練走就好，別擔心！",
      },
      {
        id: "faq-health",
        label: "有些健康狀況能潛嗎？",
        answer:
          "有心臟病／高血壓／氣喘／懷孕／中耳炎／近期手術，報名時請主動告知教練 🙂 感冒鼻塞、耳朵不適不建議下水，建議改期。近視可以戴隱形眼鏡（建議日拋）。",
      },
      {
        id: "faq-bring",
        label: "要帶什麼？裝備怎麼辦？",
        answer:
          "自備泳衣、毛巾、換洗衣物就好 🩱 潛水裝備可以租（LINE 預約時一起跟教練說）。船潛記得帶身分證件、建議帶健保卡～",
        links: [{ label: "裝備租借費用", href: "/#courses" }],
      },
    ],
  },
  {
    id: "policy",
    label: "📋 費用 / 取消退款 / 安全須知",
    intro: "想確認哪一項？我讀後台最新的給你 📋",
    children: [
      { id: "policy-cancel", label: "取消／退款政策（即時）", live: "cancel" },
      { id: "policy-safety", label: "安全須知（即時）", live: "safety" },
      { id: "policy-gear", label: "裝備租借／日潛費用（即時）", live: "gear" },
    ],
  },
  {
    id: "booking",
    label: "📝 怎麼預約？",
    answer:
      "預約超簡單：加我們 LINE 官方帳號跟汪汪教練說你想潛的日期／人數就可以囉 😄 也能先看場次、用手機 LINE 登入預約、或留下詢問！",
    links: [
      { label: "看場次・手機預約", href: "/schedule" },
      { label: "看場次表", href: "/schedule" },
      { label: "線上詢問表單", href: "/contact" },
    ],
  },
];
