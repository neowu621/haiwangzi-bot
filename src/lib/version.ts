// 規則: YYYYMMDD_NN
//   YYYYMMDD = 【本次發版當天】的日期（Asia/Taipei）—— 不是沿用上一版的！
//     ⚠️ 2026-07-09 到 2026-08-31 這段期間 (v1000～v1074) 只 bump 了 NN，
//        日期一直卡在 20260709，已於 v1075 修正。每次改得兩個都改。
//   NN = 全域累計、不歸零
// 無後綴字母；歷史 v740M~v770M 的 "M" 已確認無意義，自 v771 起不再使用。
// 每次 push GitHub / 部署 Zeabur 前必須 bump
export const APP_VERSION = "20260902_1077";
