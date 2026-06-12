// v497：全站商家基本資料 — 用於 LocalBusiness 結構化資料（Google 商家卡 / 地圖 / 在地搜尋）。
//
// ⚠️ 老闆要補的欄位：下面標 TODO 的，填了才會送進 Google（留空就自動省略，不會送假資料）。
//    填好後 commit，Google 下次爬就會看到。完整商家卡還需另外去申請「Google 商家檔案」(見回覆說明)。

export const BUSINESS = {
  // ── 已知（可直接用）──────────────────────────────
  name: "東北角海王子潛水",
  altName: "Sea Prince Diving",
  url: "https://haiwangzi.xyz",
  image: "https://haiwangzi.xyz/home/src-hero.webp",
  logo: "https://haiwangzi.xyz/brand-icons/hwz-deepblue.png",
  description: "東北角萊萊鶯歌石潛水基地，汪汪教練帶你安心探索水下世界——體驗潛水、OW/AOW 考證、Fun Dive 練功、東北角潛點與國內外潛旅。",
  priceRange: "$$", // 大致價位等級（$ 便宜 ~ $$$$ 高），不放實際金額
  areaServed: ["東北角", "基隆", "新北", "貢寮", "瑞芳"],
  // 聯絡方式：老闆指定「只用 LINE」（官方帳號 @894bpmew），不公開電話/地址
  lineUrl: "https://line.me/R/ti/p/@894bpmew",
  sameAs: [
    "https://line.me/R/ti/p/@894bpmew",
    "https://www.youtube.com/@haiwangzi-northeast-coast",
    "https://www.instagram.com/chengruwang/",
    "https://www.facebook.com/profile.php?id=100064926510785",
  ],

  // 聯絡電話/地址/座標：老闆決定只走 LINE，不公開（留空 = 不送 Google，不放假資料）
  telephone: "",
  streetAddress: "",
  addressLocality: "",
  addressRegion: "新北市",
  postalCode: "",
  latitude: "",
  longitude: "",
  // 營業時間：每天 07:00–17:00（老闆提供）
  openingHours: [
    { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], open: "07:00", close: "17:00" },
  ] as { days: string[]; open: string; close: string }[],
} as const;

// 產生 LocalBusiness JSON-LD（只放有值的欄位，避免送出空/假資料）
export function localBusinessJsonLd() {
  const b = BUSINESS;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "SportsActivityLocation"],
    "@id": `${b.url}/#business`,
    name: b.name,
    alternateName: b.altName,
    url: b.url,
    image: b.image,
    logo: b.logo,
    description: b.description,
    priceRange: b.priceRange,
    areaServed: b.areaServed.map((n) => ({ "@type": "AdministrativeArea", name: n })),
    sameAs: b.sameAs,
  };
  if (b.telephone) jsonLd.telephone = b.telephone;
  if (b.streetAddress || b.addressLocality) {
    jsonLd.address = {
      "@type": "PostalAddress",
      addressCountry: "TW",
      addressRegion: b.addressRegion,
      ...(b.addressLocality ? { addressLocality: b.addressLocality } : {}),
      ...(b.streetAddress ? { streetAddress: b.streetAddress } : {}),
      ...(b.postalCode ? { postalCode: b.postalCode } : {}),
    };
  }
  if (b.latitude && b.longitude) {
    jsonLd.geo = { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude };
  }
  if (b.openingHours.length) {
    jsonLd.openingHoursSpecification = b.openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.open,
      closes: h.close,
    }));
  }
  return jsonLd;
}
