import { redirect } from "next/navigation";

// v591：會員登入入口已改為 /pclogin。舊網址 /dtest 自動轉向（書籤不失效）。
export const dynamic = "force-static";

export default function DtestRedirect() {
  redirect("/pclogin");
}
