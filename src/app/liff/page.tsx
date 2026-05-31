import { redirect } from "next/navigation";

// /liff 入口（沒帶子路徑）→ 自動導到 /liff/welcome
// 這樣 LIFF Endpoint URL 設為 https://haiwangzi.zeabur.app/liff
// 時，使用者開 liff.line.me/<id>（無路徑）也能正常進入首頁
export default function LiffRootRedirect() {
  redirect("/liff/welcome");
}
