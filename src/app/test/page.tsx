import { redirect } from "next/navigation";

// v446：改版首頁已轉為正式首頁 /；/test 永久導向 /
export default function TestRedirect() {
  redirect("/");
}
