// v429: 首頁靜態資料常數（從 page.tsx 抽出，供 Server Component 與 islands 共用）。
// 這個檔案沒有 "use client"，預設在 server 端使用；NAV 也被 SiteNav island 匯入。
import type React from "react";

export const LINE_BOOK_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@894bpmew";

// v439：取消「LINE 帶預填訊息（oaMessage）」——改回單純加好友連結 LINE_BOOK_URL，避免找不到帳號等麻煩。
export const YT_CHANNEL = "https://www.youtube.com/@haiwangzi-northeast-coast";
export const IG_URL = "https://www.instagram.com/chengruwang/";
export const FB_URL = "https://www.facebook.com/profile.php?id=100064926510785";

// v462：全彩品牌 icon（FB 藍圓 / YT 紅圓白播放 / IG 漸層方圓），取代原單色圓圈。
// 純 inline SVG，零外部請求；IG 漸層 id 需 uid 前綴避免同頁重複。
export const FbIcon = ({ s = 42 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path fill="#fff" d="M15.9 15.21l.53-3.45h-3.31V9.52c0-.95.46-1.87 1.95-1.87h1.51V4.71s-1.37-.23-2.68-.23c-2.73 0-4.52 1.65-4.52 4.65v2.63H6.34v3.45h3.04v8.35a12.1 12.1 0 0 0 3.74 0v-8.35h2.78z" />
  </svg>
);
export const YtIcon = ({ s = 42 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#FF0000" />
    <path fill="#fff" d="M9.7 7.9 16.9 12l-7.2 4.1z" />
  </svg>
);
export const IgIcon = ({ s = 42, uid = "ig" }: { s?: number; uid?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <radialGradient id={`${uid}-g`} cx="30%" cy="107%" r="150%">
        <stop offset="0%" stopColor="#fdf497" />
        <stop offset="9%" stopColor="#fdf497" />
        <stop offset="45%" stopColor="#fd5949" />
        <stop offset="60%" stopColor="#d6249f" />
        <stop offset="90%" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill={`url(#${uid}-g)`} />
    <g fill="none" stroke="#fff" strokeWidth="1.7">
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4" />
      <circle cx="12" cy="12" r="3.4" />
    </g>
    <circle cx="16.6" cy="7.4" r="1.15" fill="#fff" />
  </svg>
);

// v460/v463：順序 = 頁面 section 實際出現順序（上排捷徑、右側圓點都吃這份，必須與內容對齊）
export const NAV = [
  { href: "#reviews", label: "學員怎麼說" },
  { href: "#about", label: "關於汪汪" },
  { href: "#courses", label: "潛水課程" },
  { href: "#start", label: "新手上路" },
  { href: "#spots", label: "東北角潛點" },
  { href: "#trips", label: "潛旅目的地" },
  { href: "#news", label: "最新動態" },
  { href: "#faq", label: "常見問題" },
];

// v413：潛水課程（依老闆提供內容）
// v751：移除「持證精進·Fun Dive 練功」課程卡 —— Fun Dive 本質＝持證者的一日潛水，
//   不是課程；想 Fun Dive 走「一日潛水」預約／「日潛 Fun Dive」費用頁即可，避免重複。
//   只留 體驗潛水 / OW / AOW 三種真正的「課程」。
export const COURSES = [
  {
    badge: "免證照體驗 · DISCOVER",
    title: "體驗潛水（免證照）",
    msg: "我想詢問「體驗潛水（免證照）」的費用與時間",
    price: "NT$2,500",
    includes: "免證照・含基本照相・全套裝備",
    items: [
      { t: "完全沒潛過、不會游泳都可以——裝備提供浮力，放鬆漂著就好", hl: true },
      { t: "教練一對一全程陪同，先在淺水區慢慢適應再下潛", hl: false },
      { t: "基本課程＋水下時間約 1.5 小時，含基本照相 📷 與全套裝備使用", hl: true },
      { t: "確定日期預約收 50% 訂金", hl: false },
      { t: "自備：泳衣／泳褲、浴巾、盥洗用品", hl: false },
      { t: "報名請告知性別、身高、體重、鞋號，幫你準備合身防寒衣", hl: false },
    ],
  },
  {
    badge: "考證照 · OPEN WATER",
    title: "開放水域潛水員 OW（保證班）",
    msg: "我想詢問「OW 開放水域潛水員」課程",
    price: "NT$14,500",
    includes: "含教材・氣瓶・裝備・泳池費",
    items: [
      { t: "學科 2 小時 ＋ 泳池 4 小時 ＋ 海洋實習 2 天（6 支氣瓶）", hl: false },
      { t: "加贈 1 天 Fun Dive（3 支氣瓶），海洋實習共 9 支氣瓶", hl: true },
      { t: "地點：學科 三重｜泳池 青年公園（萬華水源路）｜海洋實習 東北角", hl: false },
      { t: "上課採預約制，日期確定後開課", hl: false },
      { t: "時間彈性：可連續 4 天，或拆開上；平日／假日晚上也能排學科、泳池", hl: false },
      { t: "結業一年內：外島＋國外旅行各 1 次，免費租裝備", hl: true },
      { t: "報名繳訂金 NT$6,000，首日上課繳清尾款", hl: false },
    ],
  },
  {
    badge: "進階 · ADVANCED",
    title: "進階開放水域潛水員 AOW",
    msg: "我想詢問「AOW 進階」課程",
    price: "NT$14,500",
    includes: "含教材・氣瓶・裝備・證照費",
    items: [
      { t: "學科 2 小時 ＋ 海洋實習 2 天（6 支氣瓶）", hl: false },
      { t: "加贈 1 天 Fun Dive（3 支氣瓶），海洋實習共 9 支氣瓶", hl: true },
      { t: "七大專長：船潛・水下導航・夜潛・深潛・放流・頂尖中性浮力・水推 DPV", hl: false },
      { t: "另含浮力袋、打撈袋使用與魚類辨識", hl: false },
      { t: "上課採預約制，日期確定後開課", hl: false },
      { t: "加購高氧（Nitrox）證照優惠價 NT$3,500", hl: true },
      { t: "報名繳訂金 NT$6,000，首日上課繳清尾款", hl: false },
    ],
  },
];

export const SPOTS = [
  { n: "01", slug: "chaojing", bg: "bg-reeffish", zh: "潮境公園", en: "Chaojing", level: "初級", d: "基隆望海巷海洋保育區，灣澳地形浪況穩定、魚群親人，獨立礁布滿海扇與軟珊瑚，浮潛、深潛與微距皆宜。", tags: ["深度 約 25m", "新手 · Fun Dive", "適合練功"] },
  { n: "02", slug: "km82", bg: "bg-coraldiver", zh: "82.8K", en: "Coastal KM 82.8", level: "挑戰", d: "以濱海公路里程牌命名的東北角「微距天堂」，岬角延伸地形、水攝生物極豐；易起急流、上下需攀爬陡梯，屬進階潛點。", tags: ["深度 25m+（可達 40m）", "進階"] },
  { n: "03", slug: "crystal-palace", bg: "bg-blue", zh: "水晶宮", en: "Crystal Palace", level: "進階", d: "東北角船潛經典點之一，水質清澈、岩礁交錯，能見度好時光線穿透宛如水晶宮殿，畫面夢幻。", tags: ["船潛 · 約 15–25m", "Fun Dive · 進階"] },
  { n: "04", slug: "shenao", bg: "bg-macro", zh: "深澳", en: "Shen'ao", level: "初級", d: "以海上地標「象鼻岩」聞名的東北角秘境，水下約 5–13 米、岩縫與通道地形有趣，可見藍雀鯛、小丑魚等魚群與軟珊瑚，深度親民、輕鬆又好拍。", tags: ["深度 約 5–13m", "新手 · Fun Dive", "適合練功"] },
  { n: "05", slug: "lailai", bg: "bg-coral", zh: "萊萊鶯歌石", en: "Lailai Yingge Rock", level: "挑戰", d: "位於三貂角／馬崗一帶，海蝕平台發達、太平洋暖流經過，魚類繁盛；石洞常藏龍蝦，並有海蛇、章魚與大型魚群。", tags: ["普遍不深 · 無強流", "Fun Dive"] },
  { n: "06", slug: "boat-dive", bg: "bg-boat", zh: "船潛", en: "Boat Dive", level: "進階", d: "搭船前往岸潛到不了的潛點——基隆嶼彩虹礁、象鼻岩、玫瑰花園、鋼鐵礁、沈船、花牆等，地形開闊、有機會遇大型魚群與壯觀礁盤。", tags: ["深度 約 15–25m", "Fun Dive · 進階"] },
  { n: "07", slug: "longdong", bg: "bg-blue", zh: "龍洞", en: "Long Dong", level: "初級", d: "東北角最具代表性的水肺潛水（scuba）潛點之一，四稜砂岩海蝕峭壁地形壯觀，灣內浪況相對穩定、能見度佳，珊瑚與熱帶魚豐富。和美、龍洞灣等多處入水點，從免證照體驗潛水到 Fun Dive、OW/AOW 考證海洋實習都很適合，是新手與考證的熱門地點。", tags: ["深度 約 5–18m", "新手～進階", "體驗 · 考證熱點"] },
];

export const TRIPS = [
  { n: "國內 · TAIWAN", bg: "bg-greenreef", zh: "綠島", en: "Green Island", level: "初級", d: "世界級潛水聖地，能見度常破 20 米、終年水溫宜人，硬軟珊瑚與魚群豐富，地標如千年「大香菇」微孔珊瑚、石朗、柴口與鋼鐵礁。", tags: ["深度 約 5–30m", "新手～進階", "3 天 2 夜"] },
  { n: "國內 · TAIWAN", bg: "bg-blue", zh: "蘭嶼", en: "Orchid Island", level: "進階", d: "位於黑潮暖流帶，全年水溫 20–29°C、海況佳時能見度可達 50 米，火山島地形有藍洞、洞窟與斷層，是進階潛水員嚮往的潛點。", tags: ["深度 7–30m+", "Fun Dive · 進階", "3 天 2 夜"] },
  { n: "國內 · TAIWAN", bg: "bg-turtle", zh: "小琉球", en: "Liuqiu", level: "初級", d: "台灣少數全年適潛、受東北季風影響小的海域，全年水溫約 25°C、99% 機率看到海龜，沈船密度全球數一數二，新手老手皆宜。", tags: ["深度 5–12m（沈船 25–35m）", "新手首選", "2 天 1 夜"] },
  { n: "國外 · PHILIPPINES", bg: "bg-school", zh: "菲律賓 媽媽島", en: "Malapascua", level: "挑戰", d: "Monad Shoal 是長尾鯊的家，清晨從深海游來，是世界上唯一能看見長尾鯊清潔的地方；另有沈船與海馬、海蛞蝓等微距，大物與微距一次滿足。", tags: ["長尾鯊點 25–30m", "Fun Dive · 進階", "4–5 天"] },
  { n: "國外 · PHILIPPINES", bg: "bg-coraldiver", zh: "菲律賓 薄荷島", en: "Bohol · Panglao", level: "進階", d: "以邦勞島 Alona Beach 為據點，鄰近巴里卡薩島（Balicasag）擁有世界頂級大斷層，暱稱「小西巴丹」，傑克魚風暴、峭壁牆潛與海龜精彩，潛水度假兼具。", tags: ["深度 約 5–23m", "新手～進階", "5–6 天"] },
  { n: "國外 · PHILIPPINES", bg: "bg-coron", zh: "菲律賓 科隆島", en: "Coron · Palawan", level: "進階", d: "世界級二戰日軍沈船潛點，十餘艘船體保存完好、被珊瑚攀附，有些浮潛即可一睹歷史；北部保護區更有真正的「美人魚」儒艮，沈船探險與海洋神獸一次滿足。", tags: ["沈船 3–30m+", "新手～進階", "5 天 4 夜起"] },
];

// v424t：難度分級 → 顏色 class（初級綠 / 進階藍 / 挑戰橘）
export const LVL_CLASS: Record<string, string> = { "初級": "easy", "進階": "mid", "挑戰": "hard" };

export type Testimonial = { name: string; avatar: string; activity: string; title: string; text: string; photo?: string };
// 內建保底（後台未設定時顯示）；後台 homeTestimonials 有資料時整組取代。第 1 則為「主打長文卡」。
export const BUILTIN_REVIEWS: Testimonial[] = [
  { name: "百潛菜雞學員", activity: "小琉球考證 → 東北角長期練功", title: "從菜雞到近百潛的蛻變 🐠", avatar: "/home/review-featured.webp",
    text: "在小琉球拿到證照後，每次練習都要下南部或跑外島，時間成本太高，後來竟變成「一年才潛一次」😮‍💨。於是我決定在東北角找位能長期跟著練習的教練，跟過幾位之後，真心大推汪汪教練！他乍看是個「汪大膽」😂，但他的膽是長在判斷力和能 cover 你的真本事上 💪。第一次跟潛，我偷偷帶了位經驗不足的小菜雞 🐣，汪汪沒有為了賺錢硬讓大家下水，而是另外幫我們約一天、少接學員，把心力都放在照顧我們身上 🥹。現在的我從連下潛都有狀況的新手，到現在累積近百潛 🎉，跟著教練潛水他對路線超熟、方向感一流 🧭，還會背專業大相機幫你側拍美照 📸，每次上岸都收穫滿滿 💕！" },
  { name: "大翅鯨魚", activity: "", title: "平安上岸的安心感 🤝", avatar: "/home/review-whale.webp",
    text: "跟著汪汪教練下潛，絕對沒有問題，他總是能平平安安把你帶上岸 🌅。這份穩穩的安心感，是我每次下水最大的底氣 💙" },
  { name: "克服怕水的學員", activity: "", title: "克服恐懼的暖心陪伴 🥹", avatar: "/home/review-fear.webp",
    text: "原本耳壓沒平衡好、面鏡又進水 😭，汪汪教練每潛一段就提醒做耳壓平衡，現在完全克服恐懼啦 🎉！大推怕水的你 👍" },
  { name: "珊瑚控學員", activity: "", title: "滿海的「花椰菜」驚喜 🥦🪸", avatar: "/home/review-coral.webp",
    text: "謝謝汪教練帶我看到了滿滿一整片的花椰菜珊瑚 🌸，那畫面真的美到捨不得眨眼，是水下最浪漫的小驚喜 💕" },
  { name: "潛水家庭", activity: "", title: "體能技術滿點，照顧長輩 👴👵", avatar: "/home/review-family.webp",
    text: "體能、技術都超強的教練 💪，而且永遠都把老人家照顧得好好的 🤗。跟著他下水，全家大小都能玩得安心又開心 💙" },
  { name: "海底攝影愛好者", activity: "", title: "內太空般的靜謐之美 🌌", avatar: "/home/review-photo.webp",
    text: "跟著汪汪教練悠遊海底世界，欣賞豔麗的海扇、穿梭的魚群和優雅的海龜 🐢。陽光灑落湛藍海水，氣泡靜靜上升 🫧，時間彷彿停格 ⏳——這就是「內太空」最迷人的地方 ✨" },
  { name: "壁潛漫遊者", activity: "", title: "每一潛都過癮的滿足感 🫧", avatar: "", photo: "/home/review-wall.webp",
    text: "汪汪教練帶潛經驗豐富又認真 💪，挑的潛點每一個都精彩、各有特色，每次潛完都有滿滿過癮的滿足感 🔱。最難忘的是沿著珊瑚陡壁緩緩前行，抬頭看著一串串氣泡向上升起——那一刻真心覺得，白色氣泡，是我們與海洋的對話 🌊🫧。" },
];
export const DEFAULT_REVIEWS_NOTE = "想在東北角安心練功、突破自己、又能拍到美照與美好回憶，那就交給汪汪教練準沒錯！🐬🌊";

export type QA = { q: string; a: React.ReactNode };
export const FAQ: { zh: string; en: string; items: QA[] }[] = [
  { zh: "新手別擔心（最常見的顧慮）", en: "Don't Worry, First-Timers", items: [
    { q: "潛水危險嗎？第一次會不會很可怕？", a: "其實比大多數人想像的安全、也輕鬆很多。體驗潛水是在小團、教練全程陪同的可控環境下進行，先在淺水區慢慢適應，確認你準備好了才往下。你要做的只有一件事——放輕鬆呼吸，其餘都交給教練。" },
    { q: "我怕水、怕深，在水裡慌了想上岸怎麼辦？", a: "很多學員一開始都會緊張，這很正常。我們會從淺水區一步步來，絕不勉強你。任何時候只要覺得不舒服，比個手勢，教練會立刻帶你慢慢上升。整個節奏由你決定，不趕進度。" },
    { q: "耳朵會不會痛？", a: "下潛時耳朵會有壓力感，這是正常的。教練會教你「捏住鼻子、輕輕吐氣」來做耳壓平衡，配合慢慢下潛就不會痛。只要覺得耳朵脹，停下來、上升一點再試一次就好。" },
    { q: "在水裡真的能呼吸嗎？嗆到、面鏡進水怎麼辦？", a: "可以，透過呼吸器用嘴巴正常呼吸就好，下水前會先在淺水帶你練習到順為止。萬一面鏡進水，也會教你簡單的排水方式；而且教練全程都在你身邊，真的不用擔心。" },
    { q: "會不會遇到鯊魚或危險的海洋生物？", a: "東北角的潛點以珊瑚、熱帶魚、偶爾的海龜等溫和生態為主。海洋生物其實不會主動攻擊人，只要不伸手觸碰、保持適當距離，就能安心欣賞。教練也會帶你在安全範圍內觀察。" },
    { q: "完全不會游泳、體力不好、怕冷，可以嗎？", a: "都可以。裝備本身會提供浮力，不需要會游泳；體驗潛水的活動量不大，放鬆漂著就好。我們也會穿防寒衣保暖，如果覺得冷隨時告訴教練。" },
  ] },
  { zh: "剛拿證照？持證新手最常見的煩惱", en: "Newly Certified Divers", items: [
    { q: "中性浮力一直抓不好，老是浮浮沉沉，正常嗎？", a: "非常正常，幾乎每個剛拿證照的人都會卡這一關。多半是配重偏多，加上緊張時不自覺「吸多吐少」造成的。汪汪會先幫你重新抓對配重、把身體姿勢從直立調成平趴流線型，再帶你用呼吸微調浮力。只要多潛幾次、有人在旁邊即時提醒，很快就會明顯進步。" },
    { q: "我特別會耗氣，氣瓶總是比別人先見底，是體質不好嗎？", a: "不是體質問題，別擔心。耗氣快通常來自緊張、呼吸太快太淺、浮力不穩一直踢水，或姿勢不對增加阻力。汪汪會帶你放慢呼吸（慢吸長吐）、把浮力與姿勢調順，力氣省下來、氣自然耗得慢。這是練習就會改善的事，不是你的問題。" },
    { q: "踢水容易累，還會揚沙、踢到珊瑚怎麼辦？", a: "這也是新手常見狀況，多半是配重過重、變成「頭上腳下」的姿勢在踢。汪汪會幫你修正配重與身體流線，教你更省力、又不揚沙的踢法（例如 frog kick），讓你潛得輕鬆，也保護海底珊瑚不被踢斷。" },
    { q: "證照放了好幾年沒潛，技巧都忘光，還能下水嗎？", a: "當然可以，這很常見。汪汪會先帶你做「複習潛」——在淺水區把面鏡排水、調節器尋回、浮力控制等基本功重新熟悉一遍，確認你找回手感、也放鬆了，才往較深的地方走，全程不趕。" },
    { q: "我想慢慢練、希望被多一點指導，建議怎麼預約？", a: "如果你希望教練能更專注地帶你、把技巧紮實練好，建議盡量約「平日」時段。平日人比較少，汪汪能給你更接近一對一的指導、不用趕行程，對剛入門、想好好打底的潛水員特別適合。預約時在 LINE 跟汪汪說你的目標（例如想練浮力），他會幫你安排合適的時間與潛點。" },
  ] },
  { zh: "健康與安全", en: "Health & Safety", items: [
    { q: "哪些健康狀況需要事先告知？", a: "為了你的安全，若有心臟病、高血壓、氣喘、懷孕、中耳炎或近期動過手術等狀況，請務必在報名時主動告知，由教練評估是否適合下水，必要時建議先諮詢醫師。當天若有感冒、鼻塞或耳朵不適，因為無法順利做耳壓平衡，也不建議下水，建議改期。" },
    { q: "活動當天有哪些注意事項？", a: (<><p>為了你與團隊的安全，請配合以下事項：</p><ul><li>前一晚請勿飲酒、避免熬夜，保持良好體力</li><li>請準時集合，並全程配合教練的安全指示</li><li>潛水後 18–24 小時內請避免搭乘飛機，以降低減壓病風險</li></ul><p>若未遵守安全規範，為維護安全，教練有權終止活動。</p></>) },
    { q: "近視、戴隱形眼鏡可以潛水嗎？", a: "可以。近視者可配戴隱形眼鏡下水（建議用日拋）。如果需要有度數的面鏡，請事先告知，我們會盡量為你準備。" },
    { q: "生理期可以潛水嗎？", a: "可以，依個人身體狀況評估即可，若有不適請告知教練。重點仍是當天身體狀態良好、能放鬆下水。" },
  ] },
  { zh: "裝備與準備", en: "Gear & Preparation", items: [
    { q: "需要自己準備什麼？裝備有包含嗎？", a: "需自備泳衣、毛巾與換洗衣物；潛水裝備可自備，若有租借需求，可在 LINE 預約時同步租用裝備。戶外活動也建議帶防曬與保暖外套。" },
    { q: "需要帶證件或現金嗎？", a: "建議攜帶健保卡；若為船潛則需另帶身分證件。費用與付款方式會在 LINE 預約時跟你說明清楚。" },
  ] },
  { zh: "預約 · 天氣 · 費用", en: "Booking · Weather · Fees", items: [
    { q: "怎麼預約？需要先付訂金嗎？", a: "最方便的方式是加官方 LINE，直接在 LINE 上預約潛水。若目前沒有適合的時段，也可以先提供你想潛的地點、日期與人數，汪汪會主動跟你聯繫討論安排。訂金與付款方式都會在 LINE 上說明。" },
    { q: "天氣或海況不好怎麼辦？可以改期或退費嗎？", a: "潛水安全取決於海況。若遇到不適合下水的天氣，我們會主動聯繫你改期或依規定退費，絕不勉強下水。" },
    { q: "我會暈船，船潛該注意什麼？", a: "岸潛通常不太會暈船；如果是船潛，建議前一晚睡飽、出發前先服用暈船藥，並多看遠方的海平面。會暈船請先告訴教練，我們會幫你安排適合的座位與節奏。" },
    { q: "可以一個人報名嗎？", a: "可以，常有同學單獨報名，現場也很容易認識新潛伴，一起下水更有趣。" },
  ] },
  { zh: "保險提醒（重要）", en: "Insurance", items: [
    { q: "有保險嗎？需要自己加保嗎？", a: (<><p>潛水有兩層保障，互補不可取代：</p><p>① <b>店家責任險</b>：教練／店家已投保「水域遊憩活動責任保險」，保障活動期間責任。</p><p>② <b>個人海域險</b>：保障您個人安全，建議自行加保。富邦線上即可投保（第1類含水肺潛水）：</p><ul><li><a href="https://www.fubon.com/insurance/b2c/content/marine_activity/index.html" target="_blank" rel="noopener">富邦海域險線上投保《第1類活動》</a></li><li><a href="https://www.cathay-ins.com.tw/cathayins/personal/travel/sea/" target="_blank" rel="noopener">國泰海域活動保險（其他可參考）</a></li></ul><p style={{ fontSize: 12.5, color: "#8595a6" }}>詳細投保內容與需求依保險條款，建議自行向富邦洽詢。</p></>) },
  ] },
  { zh: "活動紀錄與隱私", en: "Photos & Privacy", items: [
    { q: "活動會拍照、錄影嗎？會公開使用嗎？", a: "活動中可能拍攝照片／影片，用於官方社群與活動紀錄。若你不同意公開使用，請於活動前告知，我們會予以尊重。" },
  ] },
];

// 共用小元件：LINE icon（純 SVG、無互動，server 端可渲染）
export const LineIcon = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.5 2 2 5.8 2 10.4c0 4.1 3.6 7.6 8.5 8.2.3.07.8.2.9.5.1.27.06.7.03.97l-.14.86c-.04.25-.2 1 .87.54s5.8-3.4 7.9-5.85C21.5 14 22 12.3 22 10.4 22 5.8 17.5 2 12 2z" /></svg>
);
