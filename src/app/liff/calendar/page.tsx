// v697：一日潛水已整合進「潛水預約」整合頁 → 轉址(保留舊網址/書籤可用)
import { redirect } from "next/navigation";

export default function CalendarRedirect() {
  redirect("/liff/booking?tab=calendar");
}
