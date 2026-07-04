// 規則: YYYYMMDD_NN, NN 全域累計不歸零 (參考 ~/.claude/CLAUDE.md)
// 無後綴字母；歷史 v740M~v770M 的 "M" 已確認無意義，自 v771 起不再使用。
// 每次 push GitHub / 部署 Zeabur 前必須 bump
export const APP_VERSION = "20260703_793";
