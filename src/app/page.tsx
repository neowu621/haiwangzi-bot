"use client";
// v402：東北角海王子 — 公開行銷首頁（移植自原型「藍色實拍版」）。
//   最新動態的 YouTube/Instagram 自動抓取於後續版本接上（MediaPost + Behold）。
import { useEffect, useRef, useState } from "react";
import "./home.css";
import { APP_VERSION } from "@/lib/version";

const LINE_BOOK_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@894bpmew";
const YT_CHANNEL = "https://www.youtube.com/@haiwangzi-northeast-coast";
const IG_URL = "https://www.instagram.com/chengruwang/";
const FB_URL = "https://www.facebook.com/profile.php?id=100064926510785";

const NAV = [
  { href: "#spots", label: "東北角潛點" },
  { href: "#trips", label: "潛旅目的地" },
  { href: "#news", label: "最新動態" },
  { href: "#about", label: "關於汪汪" },
  { href: "#courses", label: "潛水課程" },
  { href: "#reviews", label: "學員怎麼說" },
  { href: "#faq", label: "常見問題" },
];

// v413：潛水課程（依老闆提供內容）
const COURSES = [
  {
    badge: "考證照 · OPEN WATER",
    title: "開放水域潛水員 OW（保證班）",
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

const SPOTS = [
  { n: "01", bg: "bg-reeffish", zh: "潮境公園", en: "Chaojing", d: "基隆望海巷海洋保育區，灣澳地形浪況穩定、魚群親人，獨立礁布滿海扇與軟珊瑚，浮潛、深潛與微距皆宜。", tags: ["深度 約 25m", "新手 · Fun Dive"] },
  { n: "02", bg: "bg-coraldiver", zh: "82.8K", en: "Coastal KM 82.8", d: "以濱海公路里程牌命名的東北角「微距天堂」，岬角延伸地形、水攝生物極豐；易起急流、上下需攀爬陡梯，屬進階潛點。", tags: ["深度 25m+（可達 40m）", "進階"] },
  { n: "03", bg: "bg-blue", zh: "水晶宮", en: "Crystal Palace", d: "東北角船潛經典點之一，水質清澈、岩礁交錯，能見度好時光線穿透宛如水晶宮殿，畫面夢幻。", tags: ["船潛 · 約 15–25m", "Fun Dive · 進階"] },
  { n: "04", bg: "bg-macro", zh: "深澳", en: "Shen'ao", d: "以海上地標「象鼻岩」聞名的東北角秘境，水下約 5–13 米、岩縫與通道地形有趣，可見藍雀鯛、小丑魚等魚群與軟珊瑚，深度親民、輕鬆又好拍。", tags: ["深度 約 5–13m", "新手 · Fun Dive"] },
  { n: "05", bg: "bg-coral", zh: "萊萊鶯歌石", en: "Lailai Yingge Rock", d: "位於三貂角／馬崗一帶，海蝕平台發達、太平洋暖流經過，魚類繁盛；石洞常藏龍蝦，並有海蛇、章魚與大型魚群。", tags: ["普遍不深 · 無強流", "Fun Dive"] },
  { n: "06", bg: "bg-boat", zh: "船潛", en: "Boat Dive", d: "搭船前往岸潛到不了的潛點——基隆嶼彩虹礁、象鼻岩、玫瑰花園、鋼鐵礁、沈船、花牆等，地形開闊、有機會遇大型魚群與壯觀礁盤。", tags: ["深度 約 15–25m", "Fun Dive · 進階"] },
];

const TRIPS = [
  { n: "國內 · TAIWAN", bg: "bg-greenreef", zh: "綠島", en: "Green Island", d: "世界級潛水聖地，能見度常破 20 米、終年水溫宜人，硬軟珊瑚與魚群豐富，地標如千年「大香菇」微孔珊瑚、石朗、柴口與鋼鐵礁。", tags: ["深度 約 5–30m", "新手～進階", "3 天 2 夜"] },
  { n: "國內 · TAIWAN", bg: "bg-blue", zh: "蘭嶼", en: "Orchid Island", d: "位於黑潮暖流帶，全年水溫 20–29°C、海況佳時能見度可達 50 米，火山島地形有藍洞、洞窟與斷層，是進階潛水員嚮往的潛點。", tags: ["深度 7–30m+", "Fun Dive · 進階", "3 天 2 夜"] },
  { n: "國內 · TAIWAN", bg: "bg-turtle", zh: "小琉球", en: "Liuqiu", d: "台灣少數全年適潛、受東北季風影響小的海域，全年水溫約 25°C、99% 機率看到海龜，沈船密度全球數一數二，新手老手皆宜。", tags: ["深度 5–12m（沈船 25–35m）", "新手首選", "2 天 1 夜"] },
  { n: "國外 · PHILIPPINES", bg: "bg-school", zh: "菲律賓 媽媽島", en: "Malapascua", d: "Monad Shoal 是長尾鯊的家，清晨從深海游來，是世界上唯一能看見長尾鯊清潔的地方；另有沈船與海馬、海蛞蝓等微距，大物與微距一次滿足。", tags: ["長尾鯊點 25–30m", "Fun Dive · 進階", "4–5 天"] },
  { n: "國外 · PHILIPPINES", bg: "bg-coraldiver", zh: "菲律賓 薄荷島", en: "Bohol · Panglao", d: "以邦勞島 Alona Beach 為據點，鄰近巴里卡薩島（Balicasag）擁有世界頂級大斷層，暱稱「小西巴丹」，傑克魚風暴、峭壁牆潛與海龜精彩，潛水度假兼具。", tags: ["深度 約 5–23m", "新手～進階", "5–6 天"] },
  { n: "國外 · PHILIPPINES", bg: "bg-coron", zh: "菲律賓 科隆島", en: "Coron · Palawan", d: "世界級二戰日軍沈船潛點，十餘艘船體保存完好、被珊瑚攀附，有些浮潛即可一睹歷史；北部保護區更有真正的「美人魚」儒艮，沈船探險與海洋神獸一次滿足。", tags: ["沈船 3–30m+", "新手～進階", "5 天 4 夜起"] },
];

type Testimonial = { name: string; avatar: string; activity: string; title: string; text: string };
// 內建保底（後台未設定時顯示）；後台 homeTestimonials 有資料時整組取代。第 1 則為「主打長文卡」。
const BUILTIN_REVIEWS: Testimonial[] = [
  { name: "百潛菜雞學員", activity: "小琉球考證 → 東北角長期練功", title: "從菜雞到近百潛的蛻變 🐠", avatar: "/home/review-featured.webp",
    text: "在小琉球拿到證照後，每次練習都要下南部或跑外島，時間成本太高，後來竟變成「一年才潛一次」😮‍💨。於是我決定在東北角找位能長期跟著練習的教練，跟過幾位之後，真心大推汪汪教練！他乍看是個「汪大膽」😂，但他的膽是長在判斷力和能 cover 你的真本事上 💪。第一次跟潛，我偷偷帶了位經驗不足的小菜雞 🐣，汪汪沒有為了賺錢硬讓大家下水，而是另外幫我們約一天、少接學員，把心力都放在照顧我們身上 🥹。現在的我從連下潛都有狀況的新手，到現在累積近百潛 🎉，跟著教練潛水他對路線超熟、方向感一流 🧭，還會背專業大相機幫你側拍美照 📸，每次上岸都收穫滿滿 💕！" },
  { name: "大翅鯨魚", activity: "", title: "平安上岸的安心感 🤝", avatar: "/home/review-whale.webp",
    text: "跟著汪汪教練下潛，絕對沒有問題，他總是能平平安安把你帶上岸 🌅。這份穩穩的安心感，是我每次下水最大的底氣 💙" },
  { name: "克服怕水的學員", activity: "", title: "克服恐懼的暖心陪伴 🥹", avatar: "/home/review-fear.webp",
    text: "原本給其他教練帶，因為耳壓沒平衡好、防寒衣不合身、面鏡又進水，讓我對潛水有點陰影 😭。第一次給汪汪教練帶就很安心，每下潛一段就提醒我做耳壓平衡，現在完全克服恐懼啦 🎉！人帥又有耐心、認真負責 ✨，真心大推怕水的朋友找汪汪教練 👍！" },
  { name: "珊瑚控學員", activity: "", title: "滿海的「花椰菜」驚喜 🥦🪸", avatar: "/home/review-coral.webp",
    text: "謝謝汪教練帶我看到了滿滿一整片的花椰菜珊瑚 🌸，那畫面真的美到捨不得眨眼，是水下最浪漫的小驚喜 💕" },
  { name: "潛水家庭", activity: "", title: "體能技術滿點，照顧長輩 👴👵", avatar: "/home/review-family.webp",
    text: "體能、技術都超強的教練 💪，而且永遠都把老人家照顧得好好的 🤗。跟著他下水，全家大小都能玩得安心又開心 💙" },
  { name: "海底攝影愛好者", activity: "", title: "內太空般的靜謐之美 🌌", avatar: "/home/review-photo.webp",
    text: "跟著汪汪教練悠遊在這片海底世界，盡情欣賞成群豔麗的海扇、穿梭的魚群，還有優雅滑過的海龜 🐢。抬頭望去，陽光灑落在心醉的湛藍海水中，氣泡靜靜上升 🫧，四周一片寧靜，彷彿時間在此刻停格 ⏳。我想——這就是「內太空」最迷人的地方吧 ✨" },
];
const DEFAULT_REVIEWS_NOTE = "想在東北角安心練功、突破自己、又能拍到美照與美好回憶，那就交給汪汪教練準沒錯！🐬🌊";

type QA = { q: string; a: React.ReactNode };
const FAQ: { zh: string; en: string; items: QA[] }[] = [
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
    { q: "有保險嗎？需要自己加保嗎？", a: (<><p>本店已投保相關責任保險。為了讓你獲得更完整的保障，仍強烈建議自行加保潛水專屬／海域活動保險：</p><ul><li><a href="https://www.fubon.com/insurance/b2c/content/marine_activity/index.html" target="_blank" rel="noopener">富邦海域活動險</a></li><li><a href="https://www.cathay-ins.com.tw/cathayins/personal/travel/sea/" target="_blank" rel="noopener">國泰海域活動保險</a></li></ul></>) },
  ] },
  { zh: "活動紀錄與隱私", en: "Photos & Privacy", items: [
    { q: "活動會拍照、錄影嗎？會公開使用嗎？", a: "活動中可能拍攝照片／影片，用於官方社群與活動紀錄。若你不同意公開使用，請於活動前告知，我們會予以尊重。" },
  ] },
];

const LineIcon = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.5 2 2 5.8 2 10.4c0 4.1 3.6 7.6 8.5 8.2.3.07.8.2.9.5.1.27.06.7.03.97l-.14.86c-.04.25-.2 1 .87.54s5.8-3.4 7.9-5.85C21.5 14 22 12.3 22 10.4 22 5.8 17.5 2 12 2z" /></svg>
);

// v408：目前裝置示意 icon（依視窗寬度判斷 手機 / 平板 / 桌面）
type Device = "mobile" | "tablet" | "desktop";
const DEVICE_LABEL: Record<Device, string> = { mobile: "手機", tablet: "平板", desktop: "桌面" };
const DeviceIcon = ({ device }: { device: Device }) => {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (device === "mobile")
    return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
  if (device === "tablet")
    return <svg {...common}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
  return <svg {...common}><rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
};

// v403：最新動態影片清單 + 模式改由 admin 後台管理（/admin/settings 首頁 tab）
//   - 前端先讀 /api/config → { homeVideosMode, homeVideos }
//   - homeVideosMode === "auto" 時改打 /api/youtube/recent 抓最新；失敗 fallback 用 homeVideos
//   - 都拿不到 → 用 BUILTIN_FALLBACK_VIDS 兜底（避免首頁空白）
type YtVideo = { id: string; title: string; isShort: boolean };

// 內建保底（DB 為空、API 全炸時最後一道防線）
const BUILTIN_FALLBACK_VIDS: YtVideo[] = [
  { id: "8nDJqaDl_sM", title: "萊萊鶯歌石剪輯", isShort: true },
  { id: "04q6aMx_4U4", title: "海王子潛水", isShort: false },
  { id: "0XE0lzv7jpY", title: "海王子 Shorts", isShort: true },
  { id: "z-eu3lGy8vQ", title: "海王子 Shorts", isShort: true },
  { id: "SqlGVHXuBOE", title: "海王子潛水", isShort: false },
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSec, setActiveSec] = useState("top");
  const [openQA, setOpenQA] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loaderHide, setLoaderHide] = useState(false);
  // v408：目前裝置（依視窗寬度即時判斷）
  const [device, setDevice] = useState<Device>("desktop");
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setDevice(w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  // v407B：Lightbox 開啟時鎖背景捲動 + Esc 關閉
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlaying(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [playing]);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // v403：最新動態影片清單從 /api/config 取，模式由 admin 後台控制
  const [videos, setVideos] = useState<YtVideo[]>(BUILTIN_FALLBACK_VIDS);
  const [videosLoading, setVideosLoading] = useState(true);
  // v414：學員怎麼說改為內建固定內容（後台編輯已取消）+ 總結語
  const reviews = BUILTIN_REVIEWS;
  const reviewsNote = DEFAULT_REVIEWS_NOTE;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => null) as
          | { homeVideosMode?: "curated" | "auto"; homeVideos?: YtVideo[];
              homeVideoFeaturedId?: string; homeVideoCount?: number;
              homeVideoExcludeIds?: string[]; homeVideoFilter?: "all" | "long" }
          | null;
        if (cancelled) return;
        // 學員怎麼說：v414 起改為內建固定內容（後台編輯已取消）
        const mode = cfg?.homeVideosMode ?? "curated";
        const curated = Array.isArray(cfg?.homeVideos) && cfg!.homeVideos!.length > 0
          ? cfg!.homeVideos!
          : BUILTIN_FALLBACK_VIDS;
        // 取基底清單
        let base: YtVideo[] = curated;
        if (mode === "auto") {
          try {
            const data = await fetch("/api/youtube/recent").then((r) => r.json()) as { videos?: YtVideo[] };
            if (cancelled) return;
            base = Array.isArray(data.videos) && data.videos.length > 0 ? data.videos : curated;
          } catch { base = curated; }
        }
        // v406：排除 → 長片濾鏡 → 精選置頂 → 限制數量
        const exclude = new Set((cfg?.homeVideoExcludeIds ?? []).map((s) => (s ?? "").trim()).filter(Boolean));
        const filter = cfg?.homeVideoFilter ?? "all";
        const count = Math.max(1, Math.min(12, cfg?.homeVideoCount ?? 5));
        const featuredId = (cfg?.homeVideoFeaturedId ?? "").trim();
        let list = base.filter((v) => !exclude.has(v.id));
        if (filter === "long") list = list.filter((v) => !v.isShort);
        // v417b：策展模式從清單亂數抽取（每次進站隨機 4 支）；精選置頂仍固定在最前
        const shuffle = (a: YtVideo[]) => {
          const x = [...a];
          for (let i = x.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [x[i], x[j]] = [x[j], x[i]];
          }
          return x;
        };
        if (featuredId) {
          const found = list.find((v) => v.id === featuredId);
          let rest = list.filter((v) => v.id !== featuredId);
          if (mode === "curated") rest = shuffle(rest);
          list = [found ?? { id: featuredId, title: "精選影片", isShort: false }, ...rest];
        } else if (mode === "curated") {
          list = shuffle(list);
        }
        list = list.slice(0, count);
        if (list.length === 0) list = BUILTIN_FALLBACK_VIDS.slice(0, count);
        if (!cancelled) setVideos(list);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const box = bubbleRef.current;
    if (box && box.childElementCount === 0) {
      // v419：泡泡 30→14，降低 LINE 內建瀏覽器持續動畫負荷
      for (let i = 0; i < 14; i++) {
        const b = document.createElement("span");
        const size = 4 + Math.random() * 16;
        b.style.left = Math.random() * 100 + "%";
        b.style.width = size + "px";
        b.style.height = size + "px";
        b.style.setProperty("--sway", (8 + Math.random() * 26).toFixed(0) + "px");
        b.style.setProperty("--op", (0.3 + Math.random() * 0.45).toFixed(2));
        b.style.animationDuration = (6 + Math.random() * 9).toFixed(1) + "s";
        b.style.animationDelay = (Math.random() * 8).toFixed(1) + "s";
        if (i % 3 === 0) b.style.filter = "blur(1.2px)";
        box.appendChild(b);
      }
    }
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }), { threshold: 0.12 });
    document.querySelectorAll(".hw .reveal").forEach((r) => io.observe(r));
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActiveSec((e.target as HTMLElement).id); }), { rootMargin: "-48% 0px -48% 0px" });
    document.querySelectorAll(".hw section[id]").forEach((s) => spy.observe(s));
    const t = window.setTimeout(() => setLoaderHide(true), 1100);
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); spy.disconnect(); window.clearTimeout(t); };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="hw">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;700;900&family=Noto+Serif+TC:wght@700;900&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />

      <header className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
        <a href="#top" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="crest"><img src="/home/src-11.png" alt="東北角海王子 logo" /></span>
          <span className="name"><b>東北角海王子</b><span>Northeast Coast Ocean Prince</span></span>
        </a>
        <nav className="nav-links">{NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}</nav>
        <span className="dev-badge" title={`目前裝置：${DEVICE_LABEL[device]}`} aria-label={`目前裝置：${DEVICE_LABEL[device]}`}>
          <DeviceIcon device={device} />
        </span>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line nav-cta"><LineIcon />LINE 預約</a>
        <button className={`nav-toggle${menuOpen ? " open" : ""}`} aria-label="開啟選單" onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button>
      </header>
      <div className={`nav-backdrop${menuOpen ? " open" : ""}`} onClick={closeMenu} />
      <nav className={`nav-menu${menuOpen ? " open" : ""}`} aria-label="行動選單">
        {NAV.map((n) => <a key={n.href} href={n.href} onClick={closeMenu}>{n.label}</a>)}
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line" onClick={closeMenu}><LineIcon />LINE 預約</a>
      </nav>

      <div className="dotnav">
        {[{ id: "top", l: "首頁" }, ...NAV.map((n) => ({ id: n.href.slice(1), l: n.label }))].map((d) => (
          <a key={d.id} href={`#${d.id}`} className={activeSec === d.id ? "active" : ""}><span className="lbl">{d.l}</span><span className="dot" /></a>
        ))}
      </div>

      <section className="hero" id="top">
        <div className="hero-bg" />
        <span className="light-shaft s1" /><span className="light-shaft s2" /><span className="light-shaft s3" />
        <div className="bubbles" ref={bubbleRef} />
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Lailai Yingge Rock · Northeast Coast</p>
            <h1>潛入大海<br />看見<span className="hl">另一個世界</span></h1>
            <p className="lead">剛入門、還在摸索都沒關係——有海王子教練「汪汪」在身邊，每一潛都安心。你只要放鬆，盡情擁抱大海。</p>
            <div className="hero-cta">
              <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon />LINE 立即預約</a>
              <a href="#spots" className="btn btn-ghost">看潛點與行程</a>
            </div>
          </div>
          <div className="hero-coach">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/src-hero.webp" alt="東北角海王子潛水教練 汪汪" fetchPriority="high" decoding="async" />
            <span className="tagpill">潛水教練 ｜ 海王子．汪汪</span>
          </div>
        </div>
        <div className="scroll-hint">SCROLL<i /></div>
      </section>

      <section className="poi-sec alt" id="spots">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Northeast Coast Dive Sites</span><h2 className="section-title">東北角潛點</h2><p>海王子常帶隊的東北角潛點，地形與生態各有特色，依你的程度與想看的風景安排。</p></div>
          <div className="poi-grid">
            {SPOTS.map((s) => (
              <div key={s.n} className={`poi ${s.bg} reveal`}><span className="num">{s.n}</span><div className="poi-body"><h3>{s.zh}<span>{s.en}</span></h3><p>{s.d}</p><div className="poi-meta">{s.tags.map((t) => <span key={t}>{t}</span>)}</div></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="poi-sec" id="trips">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Dive Trip Destinations</span><h2 className="section-title">潛旅目的地</h2><p>跟著海王子玩遍國內外潛點，教練全程帶隊，玩潛水也玩旅遊，名額有限。</p></div>
          <div className="poi-grid">
            {TRIPS.map((s) => (
              <div key={s.zh} className={`poi ${s.bg} reveal`}><span className="num">{s.n}</span><div className="poi-body"><h3>{s.zh}<span>{s.en}</span></h3><p>{s.d}</p><div className="poi-meta">{s.tags.map((t) => <span key={t}>{t}</span>)}</div></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="news" id="news">
        <div className="wrap">
          <div className={`feed-loader${loaderHide ? " hide" : ""}`}>
            <div className="trident-anim"><svg viewBox="0 0 48 48" fill="none"><path d="M24 4v40M24 8l-5 5M24 8l5 5M11 16c0 6 4 10 13 10s13-4 13-10M11 16v-4M37 16v-4M16 12v6M32 12v6" stroke="#66d8f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <span className="lt">載入最新動態…</span>
          </div>
          <div className="sec-head reveal"><span className="eyebrow">News &amp; Updates</span><h2 className="section-title">最新動態</h2><p>最新潛水影片整合在這裡，一次看完。</p></div>
          <div className="vid-grid shorts reveal">
            {videosLoading ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.6)" }}>
                載入最新影片中…
              </div>
            ) : videos.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.6)" }}>
                目前沒有影片，<a href={YT_CHANNEL} target="_blank" rel="noopener" style={{ color: "#66d8f6", textDecoration: "underline" }}>到 YouTube 頻道看看 →</a>
              </div>
            ) : (
              // v417：4 格直式（9:16）Shorts 牆，點擊開 lightbox 播放（facade）
              videos.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  className="vid short"
                  style={{ backgroundImage: `url(https://i.ytimg.com/vi/${v.id}/hqdefault.jpg)` }}
                  onClick={() => setPlaying(v.id)}
                  title={v.title}
                >
                  <div className="scrim" />
                  <div className="play" />
                  <div className="meta">
                    <small>{v.isShort ? "SHORTS" : "YOUTUBE"}</small>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="news-follow reveal">
            <span className="lbl">追蹤海王子，不錯過每一支新影片：</span>
            <div className="follow-btns">
              <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15V9l5.2 3-5.2 3z" /></svg></a>
              <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.17.4.37 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.37-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.37 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 4.86A4.94 4.94 0 1 0 12 17a4.94 4.94 0 0 0 0-9.94zm0 8.14A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4zm6.3-8.34a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z" /></svg></a>
              <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" /></svg></a>
            </div>
          </div>
        </div>
      </section>

      <section className="about" id="about">
        <div className="wrap about-grid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="about-photo reveal"><img src="/home/src-about.webp" alt="東北角海王子潛水教練 汪汪" loading="lazy" decoding="async" /><div className="badge">潛水教練 ｜ 海王子．汪汪 ｜ 信任．安全</div></div>
          <div className="about-text reveal">
            <span className="eyebrow">About the Diver</span>
            <h2 className="section-title">嗨，我是汪汪</h2>
            <p>潛水這件事，最重要的從來不是裝備有多好，而是帶你下水的人夠不夠專業、夠不夠細心。從第一次教學到現在，我最在意的就是兩個字——「安心」。</p>
            <p>無論你是完全沒碰過水的新手，還是想精進的進階潛水員，我都會依照你的狀況，把節奏調到最舒服，讓你把注意力放在欣賞海裡的世界。</p>
            <div className="stats">
              <div className="stat"><b>20+</b><small>教學年資</small></div>
              <div className="stat"><b>20000+</b><small>潛水次數</small></div>
              <div className="stat"><b>1200+</b><small>累積潛水人數</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* v413：潛水課程 */}
      <section className="courses" id="courses">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Diving Courses</span><h2 className="section-title">潛水課程</h2>
            <p className="sec-sub">從零基礎到進階，跟著汪汪一步步把證照變成真正的能力——課程時間可彈性安排。</p>
          </div>
          <div className="course-grid">
            {COURSES.map((c) => (
              <div key={c.title} className="course-card reveal">
                <span className="badge">{c.badge}</span>
                <h3>{c.title}</h3>
                <div className="price-row"><span className="price">{c.price}</span><span className="incl">{c.includes}</span></div>
                <ul>
                  {c.items.map((it, i) => (
                    <li key={i} className={it.hl ? "hl" : ""}><i /><span>{it.t}</span></li>
                  ))}
                </ul>
                <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line course-cta"><LineIcon />LINE 報名・諮詢</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* v414：學員怎麼說（主打長文卡 + 精選網格 + 總結語）移到潛水課程後 */}
      <section className="reviews" id="reviews">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Student Voices</span><h2 className="section-title">學員怎麼說</h2></div>
          {reviews.length > 0 && (() => {
            const f = reviews[0];
            return (
              <div className="rev-featured reveal">
                <div className="photo">
                  <div className="fphoto" style={f.avatar ? { backgroundImage: `url(${f.avatar})` } : undefined}>
                    {!f.avatar && f.name ? <span>{f.name.slice(0, 1)}</span> : null}
                  </div>
                </div>
                <div className="body">
                  <div className="stars">★★★★★</div>
                  <div className="who"><b>{f.name}</b>{f.activity ? <small>{f.activity}</small> : null}</div>
                  {f.title ? <h4>{f.title}</h4> : null}
                  <p>{f.text}</p>
                </div>
              </div>
            );
          })()}
          <div className="rev-grid">
            {reviews.slice(1).map((r, i) => (
              <div key={`${r.name}-${i}`} className="rev reveal">
                <div className="stars">★★★★★</div>
                <b className="rev-name">{r.name}</b>
                <div className="av" style={r.avatar ? { backgroundImage: `url(${r.avatar})` } : undefined}>
                  {!r.avatar && r.name ? <span>{r.name.slice(0, 1)}</span> : null}
                </div>
                {r.title ? <h4>{r.title}</h4> : null}
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          {reviewsNote ? <p className="rev-conclusion reveal"><b>學員，同一個結論：</b><br />{reviewsNote}</p> : null}
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">FAQ</span><h2 className="section-title">下水前，先把問題問清楚</h2><p>新手最常問的問題與安全須知都整理在這裡，有任何疑問也歡迎直接 LINE 問汪汪。</p></div>
          <div className="faq-list reveal">
            {FAQ.map((cat) => (
              <div key={cat.zh}>
                <div className="faq-cat"><span className="zh">{cat.zh}</span><span className="en">{cat.en}</span></div>
                {cat.items.map((qa) => {
                  const key = cat.zh + qa.q;
                  const open = openQA === key;
                  return (
                    <div key={key} className={`qa${open ? " open" : ""}`}>
                      <button onClick={() => setOpenQA(open ? null : key)}>{qa.q}<span className="ic" /></button>
                      <div className="ans" style={{ maxHeight: open ? 800 : 0 }}>{typeof qa.a === "string" ? <p>{qa.a}</p> : qa.a}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="faq-consent reveal">✅ 完成預約即視同同意以上安全須知與活動內容。<br />潛水安全第一，如果有任何不適，請不要勉強；海永遠都在，身體健康與安全最重要。<br />🌊 東北角海王子 感謝您的信任，期待與你一起安全探索海洋。</div>
        </div>
      </section>

      <section className="booking" id="book">
        <div className="wrap reveal">
          <span className="eyebrow">Let&apos;s Dive</span>
          <h2>準備好下水了嗎？</h2>
          <p>加入官方 LINE，告訴汪汪你想潛的日期與人數，幫你把行程安排好。</p>
          <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon s={20} />加 LINE 預約潛水</a>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-tag"><div className="zh">守護海洋 · 敬畏自然 · 探索深藍</div><div className="en">Protect · Respect · Explore</div></div>
          <div className="foot-grid">
            <div className="foot-col">
              <h5>東北角海王子</h5>
              <p>東北角潛水．萊萊鶯歌石潛水基地．教練汪汪帶你安心探索水下世界。</p>
              <div className="socials">
                <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15V9l5.2 3-5.2 3z" /></svg></a>
                <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.17.4.37 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.37-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.37 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 4.86A4.94 4.94 0 1 0 12 17a4.94 4.94 0 0 0 0-9.94zm0 8.14A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4zm6.3-8.34a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z" /></svg></a>
                <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" /></svg></a>
              </div>
            </div>
            <div className="foot-col"><h5>探索</h5>{NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}</div>
            <div className="foot-col"><h5>預約</h5><a href={LINE_BOOK_URL} target="_blank" rel="noopener">LINE 預約潛水</a></div>
          </div>
          <div className="foot-bottom">© {new Date().getFullYear()} 東北角海王子 Northeast Coast Ocean Prince · 探索海洋 · 安全潛水 · 專業教學</div>
          <div className="foot-version" style={{ textAlign: "center", fontSize: 10, opacity: 0.45, padding: "6px 0 2px", letterSpacing: "0.05em" }}>
            v{APP_VERSION}
          </div>
        </div>
      </footer>

      <div className="mobile-book">
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon />LINE 立即預約</a>
      </div>

      {/* v407B：影片 Lightbox 放大播放（點背景或 ✕ 關閉） */}
      {playing && (() => {
        const vertical = videos.find((v) => v.id === playing)?.isShort ?? false;
        return (
          <div className="hw-lightbox" onClick={() => setPlaying(null)} role="dialog" aria-modal="true">
            <div className={`hw-lightbox-inner${vertical ? " vertical" : ""}`} onClick={(e) => e.stopPropagation()}>
              <button className="hw-lightbox-close" onClick={() => setPlaying(null)} aria-label="關閉影片">✕</button>
              <div className={`hw-lightbox-frame${vertical ? " vertical" : ""}`}>
                <iframe
                  src={`https://www.youtube.com/embed/${playing}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title="YouTube"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
