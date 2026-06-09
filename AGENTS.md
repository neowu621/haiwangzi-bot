<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 行動裝置前端鐵則（必讀）

> 任何「會在手機上使用」的前端規劃與實作，**一律**要把以下納入考量：
> **檔案大小、讀取次數、流量、載入時間** —— 因為手機網路/效能有限，過大或過多請求會變慢、影響使用者體驗（尤其 LINE 內建 WebView 更慢）。
>
> 具體要求：圖片壓縮成 WebP、按需/延遲載入（lazy / facade）、避免一次載入過多資料、減少 API 往返次數、首屏只載必要內容、不要讓「內容可見」綁在慢資源（JS hydration / 外部字體）上。
