"use client";
// v697：旅行潛水內容(抽自 /liff/tour),供「潛水預約」整合頁即時切換用。無 LiffShell 外框。
import { useEffect, useState } from "react";
import Link from "next/link";
import { LiffLoading } from "@/components/shell/LiffLoading";

const LINE_GREEN = "#06C755";
const LINE_GREEN_D = "#04a648";
const CORAL = "#FF6B4A";
const SUB = "#8A9099";
const SUB2 = "#AEB4BC";
const HAIR2 = "#E2E5EA";

interface TourSummary {
  id: string; title: string; destination: string; dateStart: string; dateEnd: string;
  basePrice: number; deposit: number; capacity: number | null; booked: number; available: number | null;
  status: string; subtitle: string | null; durationLabel: string | null; diveStyles: string[];
  beginnerFriendly: boolean; tanksCount: number | null; extraNote: string | null;
}
const DEST_LABEL: Record<string, string> = {
  northeast: "東北角", green_island: "綠島", "green-island": "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "其他",
};
function destType(dest: string): "taiwan" | "overseas" { return dest === "other" ? "overseas" : "taiwan"; }

export function TourContent({ onGoWishes }: { onGoWishes: () => void }) {
  const [tours, setTours] = useState<TourSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [perf, setPerf] = useState<{ f: number; s: number } | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  useEffect(() => { try { setShowPerf(new URLSearchParams(window.location.search).has("debug")); } catch { /* noop */ } }, []);

  useEffect(() => {
    const s = Math.round(performance.now());
    const t0 = performance.now();
    fetch("/api/tours")
      .then((r) => r.json())
      .then((d: { tours?: TourSummary[] }) => setTours(d.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => { setPerf({ f: Math.round(performance.now() - t0), s }); setLoading(false); });
  }, []);

  const filtered = tours;
  return (
    <div style={{ background: "#EBECF0", minHeight: "100%", padding: "14px 14px 110px" }}>
      <button type="button" onClick={onGoWishes} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, marginBottom: 14 }}>
        <div style={{ background: "#fff", border: "2px dashed rgba(0,217,203,0.45)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0A2342" }}>找不到日期？</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>可提預約潛水日期（老闆會回覆討論）</div>
          </div>
          <span style={{ color: "rgba(0,217,203,0.8)", fontSize: 16 }}>›</span>
        </div>
      </button>

      <div style={{ display: "flex", gap: 9, marginBottom: 16, alignItems: "flex-end" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#1e88c7,#0a4d78)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>🐬</div>
        <div style={{ background: "#fff", borderRadius: "4px 16px 16px 16px", padding: "11px 14px", fontSize: 13.5, color: "#1A1A1B", boxShadow: "0 1px 2px rgba(0,0,0,.06)", maxWidth: "78%" }}>
          嗨～歡迎報名潛旅！<br />挑一個喜歡的<b style={{ color: LINE_GREEN_D }}>行程</b>，馬上預約 👇
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(20,30,40,.05)" }}>
        {loading && <LiffLoading variant="bubbles" label="正在載入潛水團行程..." />}
        {showPerf && perf && (<div style={{ textAlign: "center", fontSize: 10, color: SUB2 }}>⏱ 查詢往返 {perf.f}ms · 進頁→開查 {perf.s}ms</div>)}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: "30px 10px", textAlign: "center", color: SUB2, fontSize: 13 }}>
            <div style={{ fontSize: 34, marginBottom: 6 }}>🌊</div>
            目前沒有開放中的潛旅行程<br />可用上方「找不到日期？」提出預約
          </div>
        )}
        {!loading && filtered.map((t) => {
          const ov = destType(t.destination) === "overseas";
          const stripeColor = ov ? CORAL : LINE_GREEN;
          const priceColor = ov ? CORAL : LINE_GREEN_D;
          return (
            <Link key={t.id} href={`/liff/tour/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", border: `1.5px solid ${HAIR2}`, borderRadius: 14, overflow: "hidden", marginBottom: 11, background: "#fff", cursor: "pointer" }}>
                <div style={{ width: 6, background: stripeColor, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "13px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>
                        {t.title}
                        {t.subtitle && <small style={{ fontWeight: 400, color: SUB, marginLeft: 4 }}>{t.subtitle}</small>}
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        <Tag color={ov ? "ov" : "tw"}>{ov ? "海外" : DEST_LABEL[t.destination] ?? "台灣"}</Tag>
                        {t.beginnerFriendly && <Tag color="new">新手OK</Tag>}
                        {t.extraNote && <Tag color="new">{t.extraNote.split("\n")[0].slice(0, 12)}</Tag>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, color: priceColor }}>{t.basePrice.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: SUB2 }}>NT$/人</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 9, fontSize: 12, color: SUB }}>
                    <span>📅 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.dateStart}</b></span>
                    {t.durationLabel && <span>⏱ <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.durationLabel}</b></span>}
                    {t.tanksCount != null && <span>🔱 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.tanksCount}支</b></span>}
                    {t.available != null && <span>👥 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.available === 0 ? "已滿" : `剩 ${t.available}`}</b></span>}
                  </div>
                  {t.diveStyles.length > 0 && <div style={{ marginTop: 4, fontSize: 12, color: SUB }}>{t.diveStyles.join("・")}</div>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ color, children }: { color: "tw" | "ov" | "new"; children: React.ReactNode }) {
  const map = { tw: { bg: "#E3F8EC", color: LINE_GREEN_D }, ov: { bg: "#FFE9E3", color: CORAL }, new: { bg: "#FFF3DA", color: "#C98800" } };
  const c = map[color];
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "1.5px 7px", borderRadius: 5, background: c.bg, color: c.color }}>{children}</span>;
}
