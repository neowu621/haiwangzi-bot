import { redirect } from "next/navigation";

// v416：行銷首頁已移到根目錄 /；/test 永久導向 /
export default function TestRedirect() {
  redirect("/");
}
