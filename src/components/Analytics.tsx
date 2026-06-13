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
      {/* v516：LINE 預約轉換追蹤 — 用事件委派監聽全站點擊，凡點到連去 LINE
            （line.me / lin.ee / liff.line）的連結就送一個 line_click event。
            這樣 server 元件（含零 client JS 的 MobileHome）一行都不用改，
            首頁/導覽/footer/課程/潛點/場次的 LINE 按鈕全部一次涵蓋。
            可在 GA4 把 line_click 標記為轉換，量哪一頁真的帶來預約。 */}
      <Script id="ga4-line-tracker" strategy="afterInteractive">
        {`document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(!a||!a.href)return;if(!/line\\.me|lin\\.ee|liff\\.line/.test(a.href))return;var t=((a.innerText||a.textContent||'').trim()).slice(0,60);if(typeof window.gtag==='function'){window.gtag('event','line_click',{link_url:a.href,link_text:t,page_path:location.pathname});}},true);`}
      </Script>
    </>
  );
}
