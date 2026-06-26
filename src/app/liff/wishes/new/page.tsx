// v697：預約潛水(願望單)已整合進「潛水預約」整合頁 → 轉址(保留舊網址/書籤可用)
import { redirect } from "next/navigation";

export default function NewWishRedirect() {
  redirect("/liff/booking?tab=wishes");
}
