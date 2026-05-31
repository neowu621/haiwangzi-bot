// /liff 入口直接渲染 welcome 頁（不 redirect，省掉 307 來回）
// 既保留 /liff/welcome 路徑（其他頁面 backHref 還在用），
// 也讓使用者用 https://haiwangzi.zeabur.app/liff 直接看到內容。
export { default } from "./welcome/page";
