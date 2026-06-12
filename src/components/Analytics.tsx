import Script from "next/script";

// v503：Google Analytics 4（gtag.js）。只有設定了 NEXT_PUBLIC_GA_ID 才會載入，
//   沒設定 = 不輸出任何東西（不影響效能、也不會誤送資料）。
//   老闆到 analytics.google.com 開一個 GA4 資源後，把「評估 ID（G-XXXXXXXXXX）」設成
//   Zeabur 環境變數 NEXT_PUBLIC_GA_ID 即可生效。
export function Analytics() {
  // GA4 評估 ID（measurement ID 本就公開、會出現在網頁原始碼）。預設用老闆提供的 ID，
  //   仍可用環境變數 NEXT_PUBLIC_GA_ID 覆寫。
  const id = process.env.NEXT_PUBLIC_GA_ID || "G-FVNW0RYLBR";
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
