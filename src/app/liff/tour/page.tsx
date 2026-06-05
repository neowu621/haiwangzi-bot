"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";

// v186：套用 LIFF 報名 mockup 配色（LINE 綠 + coral 海外）
const LINE_GREEN = "#06C755";
const LINE_GREEN_D = "#04a648";
const CORAL = "#FF6B4A";
const SUB = "#8A9099";
const SUB2 = "#AEB4BC";
const HAIR2 = "#E2E5EA";

interface TourSummary {
  id: string;
  title: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  basePrice: number;
  deposit: number;
  capacity: number | null;
  booked: number;
  available: number | null;
  status: string;
  subtitle: string | null;
  durationLabel: string | null;
  diveStyles: string[];
  beginnerFriendly: boolean;
  tanksCount: number | null;
  extraNote: string | null;
}

const DEST_LABEL: Record<string, string> = {
  northeast: "東北角",
  green_island: "綠島",
  "green-island": "綠島",
  lanyu: "蘭嶼",
  kenting: "墾丁",
  other: "其他",
};

// 將 destination 歸類為「台灣離島」或「海外潛旅」
function destType(dest: string): "taiwan" | "overseas" {
  return dest === "other" ? "overseas" : "taiwan";
}

const ALL_STYLES = ["水推", "岸潛", "船潛", "夜潛", "沉船潛水"];

export default function TourListPage() {
  const liff = useLiff();
  const [tours, setTours] = useState<TourSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // 篩選條件
  const [fType, setFType] = useState<"all" | "taiwan" | "overseas">("all");
  const [fStyles, setFStyles] = useState<Set<string>>(new Set());
  const [fLevel, setFLevel] = useState<"all" | "beginner">("all");
  const [fBudget, setFBudget] = useState(30000);

  useEffect(() => {
    // v267：/api/tours 公開不需要 auth → 用原生 fetch 立即發送，不等 LIFF init
    fetch("/api/tours")
      .then((r) => r.json())
      .then((d: { tours?: TourSummary[] }) => setTours(d.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  // 自動取 max budget
  const maxBudget = useMemo(() => {
    if (!tours.length) return 30000;
    const m = Math.max(...tours.map((t) => t.basePrice));
    return Math.max(30000, Math.ceil(m / 1000) * 1000);
  }, [tours]);

  const filtered = useMemo(() => {
    return tours.filter((t) => {
      if (fType !== "all" && destType(t.destination) !== fType) return false;
      if (fLevel === "beginner" && !t.beginnerFriendly) return false;
      if (t.basePrice > fBudget) return false;
      if (fStyles.size) {
        for (const s of fStyles) if (!t.diveStyles.includes(s)) return false;
      }
      return true;
    });
  }, [tours, fType, fStyles, fLevel, fBudget]);

  function toggleStyle(s: string) {
    const next = new Set(fStyles);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setFStyles(next);
  }

  return (
    <LiffShell title="旅行潛水" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <div style={{ background: "#EBECF0", minHeight: "100%", padding: "14px 14px 110px" }}>
        {/* v330：找不到日期 → 引導至願望單 */}
        <Link href="/liff/wishes/new" style={{ display: "block", textDecoration: "none", marginBottom: 14 }}>
          <div style={{
            background: "#fff",
            border: "2px dashed rgba(0,217,203,0.45)",
            borderRadius: 12,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>📝</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0A2342" }}>找不到日期？</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>可提預約潛水日期（老闆會回覆討論）</div>
            </div>
            <span style={{ color: "rgba(0,217,203,0.8)", fontSize: 16 }}>›</span>
          </div>
        </Link>

        {/* 歡迎 bubble */}
        <div style={{ display: "flex", gap: 9, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg,#1e88c7,#0a4d78)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, flexShrink: 0,
          }}>🐬</div>
          <div style={{
            background: "#fff", borderRadius: "4px 16px 16px 16px",
            padding: "11px 14px", fontSize: 13.5, color: "#1A1A1B",
            boxShadow: "0 1px 2px rgba(0,0,0,.06)", maxWidth: "78%",
          }}>
            嗨～歡迎報名潛旅！<br />
            先選好你想要的<b style={{ color: LINE_GREEN_D }}>條件</b>，挑一個團，馬上預約 👇
          </div>
        </div>

        {/* 篩選卡 */}
        <div style={{
          background: "#fff", borderRadius: 16, padding: 16, marginBottom: 14,
          boxShadow: "0 1px 3px rgba(20,30,40,.05)",
        }}>
          <CardHead n="1" title="篩選條件" />
          {/* 旅遊類型 */}
          <Group label="旅遊類型">
            {(["all", "taiwan", "overseas"] as const).map((v) => (
              <Chip key={v} on={fType === v} onClick={() => setFType(v)}>
                {v === "all" ? "全部" : v === "taiwan" ? "台灣離島" : "海外潛旅"}
              </Chip>
            ))}
          </Group>
          {/* 潛水型態 */}
          <Group label="潛水型態（可複選）">
            {ALL_STYLES.map((s) => (
              <Chip key={s} on={fStyles.has(s)} coral onClick={() => toggleStyle(s)}>
                {s}
              </Chip>
            ))}
          </Group>
          {/* 經驗門檻 */}
          <Group label="經驗門檻">
            <Chip on={fLevel === "all"} onClick={() => setFLevel("all")}>不限</Chip>
            <Chip on={fLevel === "beginner"} onClick={() => setFLevel("beginner")}>新手友善</Chip>
          </Group>
          {/* 預算 */}
          <div style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: SUB2 }}>每人預算上限</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: LINE_GREEN_D }}>
                NT$ {fBudget.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={10000}
              max={maxBudget}
              step={500}
              value={fBudget}
              onChange={(e) => setFBudget(+e.target.value)}
              style={{
                width: "100%", height: 5, borderRadius: 5,
                background: HAIR2, outline: "none",
                accentColor: LINE_GREEN,
                appearance: "none", WebkitAppearance: "none",
              }}
            />
          </div>
        </div>

        {/* 行程列表 */}
        <div style={{
          background: "#fff", borderRadius: 16, padding: 16,
          boxShadow: "0 1px 3px rgba(20,30,40,.05)",
        }}>
          <CardHead n="2" title="選擇行程" rightCount={filtered.length} />
          {loading && <LiffLoading variant="bubbles" label="正在載入潛水團行程..." />}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: "30px 10px", textAlign: "center", color: SUB2, fontSize: 13 }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>🌊</div>
              沒有符合的行程<br />試著放寬預算或型態
            </div>
          )}
          {!loading && filtered.map((t) => {
            const ov = destType(t.destination) === "overseas";
            const stripeColor = ov ? CORAL : LINE_GREEN;
            const priceColor = ov ? CORAL : LINE_GREEN_D;
            return (
              <Link key={t.id} href={`/liff/tour/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{
                  display: "flex", border: `1.5px solid ${HAIR2}`,
                  borderRadius: 14, overflow: "hidden", marginBottom: 11,
                  background: "#fff", cursor: "pointer",
                }}>
                  <div style={{ width: 6, background: stripeColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: "13px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>
                          {t.title}
                          {t.subtitle && (
                            <small style={{ fontWeight: 400, color: SUB, marginLeft: 4 }}>
                              {t.subtitle}
                            </small>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                          <Tag color={ov ? "ov" : "tw"}>
                            {ov ? "海外" : DEST_LABEL[t.destination] ?? "台灣"}
                          </Tag>
                          {t.beginnerFriendly && <Tag color="new">新手OK</Tag>}
                          {t.extraNote && <Tag color="new">{t.extraNote.split("\n")[0].slice(0, 12)}</Tag>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, color: priceColor }}>
                          {t.basePrice.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: SUB2 }}>NT$/人</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 9, fontSize: 12, color: SUB }}>
                      <span>📅 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.dateStart}</b></span>
                      {t.durationLabel && (
                        <span>⏱ <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.durationLabel}</b></span>
                      )}
                      {t.tanksCount != null && (
                        <span>🤿 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>{t.tanksCount}支</b></span>
                      )}
                      {t.available != null && (
                        <span>👥 <b style={{ color: "#1A1A1B", fontWeight: 500 }}>
                          {t.available === 0 ? "已滿" : `剩 ${t.available}`}
                        </b></span>
                      )}
                    </div>
                    {t.diveStyles.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 12, color: SUB }}>
                        {t.diveStyles.join("・")}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </LiffShell>
  );
}

function CardHead({ n, title, rightCount }: { n: string; title: string; rightCount?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 7, background: LINE_GREEN,
        color: "#fff", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 12, fontWeight: 700,
      }}>
        {n}
      </span>
      <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
      {rightCount !== undefined && (
        <span style={{ marginLeft: "auto", fontSize: 12, color: SUB }}>
          符合 <b style={{ color: LINE_GREEN_D, fontSize: 15, margin: "0 2px" }}>{rightCount}</b> 團
        </span>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 12, color: SUB, fontWeight: 500, marginBottom: 8, display: "block" }}>
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({
  children,
  on,
  coral,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  coral?: boolean;
  onClick: () => void;
}) {
  const activeBg = coral ? CORAL : LINE_GREEN;
  return (
    <span
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 99,
        fontSize: 13,
        border: `1.5px solid ${on ? activeBg : HAIR2}`,
        background: on ? activeBg : "#fff",
        color: on ? "#fff" : "#555",
        cursor: "pointer",
        fontWeight: on ? 700 : 500,
        userSelect: "none",
      }}
    >
      {children}
    </span>
  );
}

function Tag({ color, children }: { color: "tw" | "ov" | "new"; children: React.ReactNode }) {
  const map = {
    tw: { bg: "#E3F8EC", color: LINE_GREEN_D },
    ov: { bg: "#FFE9E3", color: CORAL },
    new: { bg: "#FFF3DA", color: "#C98800" },
  };
  const c = map[color];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: "1.5px 7px", borderRadius: 5,
      background: c.bg, color: c.color,
    }}>
      {children}
    </span>
  );
}
