// v991：把純文字裡的網址轉成可點的連結（站內通知/客服訊息內文用）。
import React from "react";

const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * 將文字中的 http(s) 網址轉成 <a>，其餘保留純文字。回傳 React 節點陣列。
 * v1033：預設顯示「請點擊這裡 →」而非整串長網址（畫面乾淨）；傳 showRawUrl 可顯示原網址。
 */
export function linkify(
  text: string,
  linkStyle: React.CSSProperties = { color: "#0a8f86", fontWeight: 700, textDecoration: "underline", wordBreak: "break-all" },
  showRawUrl = false,
): React.ReactNode[] {
  if (!text) return [text];
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {showRawUrl ? part : "請點擊這裡 →"}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}
