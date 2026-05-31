import { redirect } from "next/navigation";
import WelcomePage from "./welcome/page";

// /liff 入口（Endpoint URL）— 兩種情境：
// 1. LINE LIFF 帶 ?liff.state=/calendar 等參數 → server-side 立刻 redirect 到 /liff/<state>
//    避免閃過 welcome 內容才被 SDK 跳走
// 2. 沒帶 state → 直接渲染 welcome
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
  // 沒帶 liff.state → 渲染 welcome
  return <WelcomePage />;
}
