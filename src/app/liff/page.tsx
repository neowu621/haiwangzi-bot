import { redirect } from "next/navigation";

// /liff 入口（Endpoint URL）— 兩種情境：
// 1. LINE LIFF 帶 ?liff.state=/calendar 等參數 → server-side 立刻 redirect 到 /liff/<state>
//    （圖文選單 / 站內通知深連結都靠這個，不受下面預設首頁影響）
// 2. 沒帶 state → v469：直接導到「個人中心」(/liff/profile)，不再經過歡迎/選單頁。
//    讓會員從 LINE 進來就到訊息通知/預約確認的地方；不在 LINE 外開時也直接走 LIFF 登入流程，
//    不再閃一個可瀏覽的歡迎網頁。
export default async function LiffRoot({
  searchParams,
}: {
  searchParams: Promise<{ "liff.state"?: string; [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const state = params["liff.state"];
  if (typeof state === "string" && state.length > 0) {
    // state 可能是 "/calendar" 也可能是 "calendar"
    const pathPart = state.startsWith("/") ? state : `/${state}`;
    redirect(`/liff${pathPart}`);
  }
  // 沒帶 liff.state → 預設導到個人中心
  redirect("/liff/profile");
}
