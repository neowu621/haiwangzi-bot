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
  sameAs: [
    "https://www.youtube.com/@haiwangzi-northeast-coast",
    "https://www.instagram.com/chengruwang/",
    "https://www.facebook.com/profile.php?id=100064926510785",
  ],

  // ── TODO 老闆補：填了才送 Google ───────────────────
  telephone: "", // TODO 公開聯絡電話，例「+886-912-345-678」（國碼 +886、去掉開頭 0）
  streetAddress: "", // TODO 集合地點/基地地址，例「新北市貢寮區福連街…」
  addressLocality: "", // TODO 鄉鎮市區，例「貢寮區」
  addressRegion: "新北市", // 縣市（已預填，可改）
  postalCode: "", // TODO 郵遞區號（可留空）
  latitude: "", // TODO 緯度（Google 地圖右鍵「這是哪裡」可查），例「25.0123」
  longitude: "", // TODO 經度，例「121.9456」
  // 營業時間：留空陣列 = 不送。例：[{ days:["Sa","Su"], open:"07:00", close:"17:00" }]
  openingHours: [] as { days: string[]; open: string; close: string }[],
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
