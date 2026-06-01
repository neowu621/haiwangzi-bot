"use client";
import { useState, useEffect } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { ChevronDown, ChevronUp, HelpCircle, Anchor, Waves, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "@894bpmew";

type FaqItem = {
  q: string;
  a: React.ReactNode;
};

// v227：FAQS 改為 builder function，吃 cancellationPolicy
function buildFaqs(cancellationPolicy: string): { category: string; icon: React.ReactNode; items: FaqItem[] }[] {
  return [
  {
    category: "預約相關",
    icon: <Anchor className="h-4 w-4" />,
    items: [
      {
        q: "如何預約日潛 / 潛水團？",
        a: (
          <>
            從 LIFF 底部「日潛」或「潛水團」分頁挑選你要的場次或行程，
            點進去填寫人數、選擇付款方式，送出預約即可。
            預約完成後系統會自動發 LINE 訊息確認。
          </>
        ),
      },
      {
        q: "可以幫朋友或家人一起報名嗎？",
        a: (
          <>
            可以！預約時的「人數」欄位填寫總人數，
            系統會請你填寫所有參加者的姓名、緊急聯絡與證照資料。
            常一起潛水的朋友可以存在「同伴清單」，下次預約一鍵帶入。
          </>
        ),
      },
      {
        q: "預約後可以取消嗎？退款規則？",
        a: (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-6">
            {cancellationPolicy}
          </pre>
        ),
      },
    ],
  },
  {
    category: "付款方式",
    icon: <Waves className="h-4 w-4" />,
    items: [
      {
        q: "有哪些付款方式？",
        a: (
          <>
            <ul className="list-disc pl-5 text-xs">
              <li><b>現場支付</b>：出航當天現場結算（限 LV2 以上會員）</li>
              <li><b>銀行轉帳</b>：預約後 7 天內匯款並上傳憑證</li>
              <li><b>LINE Pay</b>：用 LINE Pay 付款後上傳完成截圖</li>
            </ul>
          </>
        ),
      },
      {
        q: "為什麼 LV1 不能用現場支付？",
        a: (
          <>
            為了維持出團品質，LV1 新會員需於出發前 3 天完成付款。
            參加越多場次，VIP 等級會自動升等，升到 <b>LV2 龍蝦</b> 後就可以使用現場支付了。
          </>
        ),
      },
      {
        q: "抵用金（Credit）是什麼？怎麼用？",
        a: (
          <>
            抵用金是 NT$ 1:1 的折抵點數，來源包括：生日抵用金、VIP 升等獎勵、
            退款轉抵用金等。預約時可在「使用抵用金折抵」勾選，
            折抵金額會直接從總額扣除。
          </>
        ),
      },
    ],
  },
  {
    category: "VIP 等級",
    icon: <HelpCircle className="h-4 w-4" />,
    items: [
      {
        q: "VIP 等級有幾級？怎麼升等？",
        a: (
          <>
            共 5 級：
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              <div>🦐 <b>LV1 小蝦</b>：新會員，無門檻</div>
              <div>🦞 <b>LV2 龍蝦</b>：11 潛 或 NT$ 5,000</div>
              <div>🐢 <b>LV3 海龜</b>：51 潛 或 NT$ 30,001</div>
              <div>🦇 <b>LV4 蝙蝠魟</b>：101 潛 或 NT$ 80,001</div>
              <div>🦈 <b>LV5 鯨鯊</b>：201 潛 或 NT$ 150,001</div>
            </div>
            <p className="mt-2 text-xs opacity-70">
              ※ 潛水次數以實際下水氣瓶數計算（一場 3 氣瓶 = 3 潛）
            </p>
          </>
        ),
      },
      {
        q: "升等有獎勵嗎？",
        a: (
          <>
            有！每次跨等級升等都會自動發抵用金到你的帳戶，
            獎勵金額依等級而定。生日當月也會自動發放生日抵用金。
          </>
        ),
      },
      {
        q: "VIP 有什麼福利？",
        a: (
          <>
            依等級不同：生日當月一般潛水行程折扣（LV2 9 折、LV4 8 折、LV5 7 折）、
            熱門行程早鳥優先卡位權（LV4+）、年底高級 VIP 專屬感恩晚宴（LV5）等。
            詳細福利可在「個人」分頁查看當前等級。
          </>
        ),
      },
    ],
  },
  {
    category: "潛水當天",
    icon: <Anchor className="h-4 w-4" />,
    items: [
      {
        q: "需要帶什麼東西？",
        a: (
          <>
            <ul className="list-disc pl-5 text-xs">
              <li>C 卡（OW 以上）</li>
              <li>身分證</li>
              <li>Log Book（如有）</li>
              <li>防曬乳、毛巾、換洗衣物</li>
              <li>個人裝備（沒有可現場租借）</li>
            </ul>
          </>
        ),
      },
      {
        q: "可以租借裝備嗎？費用？",
        a: (
          <>
            可以，預約時勾選需要的裝備即可。費率依當前設定，
            可在預約頁面查看完整價目。建議租整套享優惠。
          </>
        ),
      },
      {
        q: "如果當天天氣不好怎麼辦？",
        a: (
          <>
            如風速超過安全門檻，系統會在前一天或當天早上自動發訊息通知取消。
            您可選擇退款 100% 或轉抵用金 110%（多 10% 優惠）。
            場次取消不影響其他天的預約。
          </>
        ),
      },
    ],
  },
];
}

function FaqAccordion({ item, defaultOpen = false }: { item: FaqItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-[var(--muted)]/40 rounded-lg"
      >
        <span className="text-[var(--foreground)]">{item.q}</span>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />}
      </button>
      {open && (
        <div className="border-t px-3 py-2.5 text-xs leading-relaxed text-[var(--muted-foreground)]"
          style={{ borderColor: "var(--border)" }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  const [cancellationPolicy, setCancellationPolicy] = useState<string>("");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setCancellationPolicy(c.cancellationPolicy ?? ""))
      .catch(() => { /* fall back to empty - buildFaqs handles */ });
  }, []);
  const FAQS = buildFaqs(cancellationPolicy);
  return (
    <LiffShell>
      <div className="pb-20">
        {/* Hero */}
        <div className="rounded-2xl p-5 mb-5"
          style={{
            background: "linear-gradient(135deg, var(--color-ocean-deep), var(--color-ocean-surface))",
          }}>
          <h1 className="text-xl font-bold text-white mb-1">
            關於 {APP_NAME}
          </h1>
          <p className="text-sm text-white/80 leading-relaxed">
            專業東北角潛水團隊，提供日潛、夜潛、潛水團與課程預約服務。
            從新手到進階潛水員都能找到適合的行程。
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1 text-white">
              🤿 全年無休
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-white">
              🏆 專業教練群
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-white">
              🦈 鯨鯊 VIP 福利
            </span>
          </div>
        </div>

        {/* 聯絡資訊 */}
        <div className="mb-5 rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
            <Phone className="h-4 w-4" />
            聯絡我們
          </h2>
          <ul className="space-y-1.5 text-xs text-[var(--muted-foreground)]">
            <li>
              <span className="font-semibold text-[var(--foreground)]">LINE：</span>
              <a href={`https://line.me/R/ti/p/${encodeURIComponent(LINE_OA)}`} target="_blank" rel="noopener noreferrer"
                className="text-[#06C755] font-mono">
                {LINE_OA}
              </a>
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">服務時間：</span>
              週一至週日 08:00 – 20:00
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">營業地區：</span>
              東北角（鶯歌石、龍洞、潮境公園、深奧）
            </li>
          </ul>
        </div>

        {/* FAQ Sections */}
        {FAQS.map((section) => (
          <div key={section.category} className="mb-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
              {section.icon}
              {section.category}
            </h2>
            <div className="space-y-1.5">
              {section.items.map((item, i) => (
                <FaqAccordion key={item.q} item={item} defaultOpen={i === 0 && section.category === "預約相關"} />
              ))}
            </div>
          </div>
        ))}

        {/* 仍有疑問？ */}
        <div className="rounded-xl border-2 p-4 text-center"
          style={{ borderColor: "var(--color-phosphor)", background: "var(--color-phosphor)" + "10" }}>
          <p className="text-sm font-semibold text-[var(--foreground)] mb-1">還有其他問題？</p>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">
            隨時透過 LINE 私訊我們，會盡快回覆 🤿
          </p>
          <a
            href={`https://line.me/R/ti/p/${encodeURIComponent(LINE_OA)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-2 text-sm font-semibold text-white"
          >
            <Mail className="h-4 w-4" />
            前往 LINE 詢問
          </a>
        </div>
      </div>
      <BottomNav />
    </LiffShell>
  );
}
