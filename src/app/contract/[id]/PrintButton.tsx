"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: "linear-gradient(120deg,#13b5a6,#1ed4c2)", color: "#04323a",
        border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 13.5, fontWeight: 800, cursor: "pointer",
      }}
    >
      🖨 列印 / 另存 PDF
    </button>
  );
}
