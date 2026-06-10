// v423：LiffProvider 從 root layout 下放到此 /liff segment layout。
//   原因：首頁與其他公開頁（/、/welcome、/line、/test、/pay、/admin…）都不用 useLiff，
//   卻被 root layout 的 <LiffProvider> 包住而背著它的 client JS。
//   把 LiffProvider 只包在 /liff/* 之下，公開頁不再載入 LIFF 邏輯，
//   /liff/* 的 LIFF 行為完全不變（所有 useLiff consumer 都在 /liff 之下）。
import { LiffProvider } from "@/lib/liff/LiffProvider";
import { UnreadPopup } from "@/components/shell/UnreadPopup"; // v473：登入未讀訊息彈窗

export default function LiffSegmentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LiffProvider>
      {children}
      <UnreadPopup />
    </LiffProvider>
  );
}
