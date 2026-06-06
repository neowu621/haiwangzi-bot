// v356：公開列表 API 的 cache header（採 Codex 建議，降尖峰 DB 壓力）
// s-maxage 給共享快取（CDN/proxy）；stale-while-revalidate 過期後仍先回舊值再背景更新
export const PUBLIC_LIST_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export const PUBLIC_STATIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
