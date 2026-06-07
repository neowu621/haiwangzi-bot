"use client";
import { useState, useEffect } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { ChevronDown, ChevronUp, HelpCircle, Anchor, Waves, Phone, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "@894bpmew";

type FaqItem = {
  q: string;
  a: React.ReactNode;
};

// v257：把純文字裡的 http(s):// URL 轉成可點 link（保留其他文字 / 換行）
function linkifyPolicy(text: string): React.ReactNode {
  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <a
        key={`u${key++}`}
        href={m[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-[var(--color-phosphor)] underline"
      >
        {m[1]}
      </a>,
    );
    lastIdx = idx + m[1].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// v227：FAQS 改為 builder function，吃 cancellationPolicy + v257 加 safetyPolicy
function buildFaqs(
  cancellationPolicy: string,
  safetyPolicy: string,
): { category: string; icon: React.ReactNode; items: FaqItem[] }[] {
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
              <li><b>🏦 銀行轉帳</b>：匯款後上傳轉帳截圖與後 5 碼</li>
              <li><b>💚 LINE Pay</b>：用 LINE Pay 付款後上傳成功截圖</li>
              <li><b>📝 其他</b>：街口、微信支付等，請填寫說明</li>
            </ul>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              下訂後到「我的預約 → 付款方式選擇」依方式不同填寫並送出。
            </p>
          </>
        ),
      },
      {
        q: "什麼時候要付款？多久要付清？",
        a: (
          <>
            預約成立後到出發前都可付款，建議**預約後 7 天內**完成。
            若超過 10 天未付款，系統會自動催繳通知；老闆審核通過付款證明後，
            訂單即正式確認。
          </>
        ),
      },
      {
        q: "付款流程怎麼走？",
        a: (
          <>
            <ol className="list-decimal pl-5 text-xs space-y-0.5">
              <li>下訂單 → 訂單狀態：待確認</li>
              <li>我的預約 → 付款方式選擇 → 選方式 + 填寫 + 上傳</li>
              <li>送出 → 狀態變「⏳ 匯款待確認」</li>
              <li>老闆審核（通常 24 小時內）→ 狀態變「已確認 + 已付清」</li>
              <li>審核通過 / 駁回都會 LINE 通知</li>
            </ol>
          </>
        ),
      },
      {
        q: "可以分次付款嗎？",
        a: (
          <>
            可以！特別是**潛水團**有訂金 + 尾款兩階段：
            <ul className="list-disc pl-5 text-xs mt-1">
              <li>第一次：上傳訂金證明 → 老闆審 → 名額保留</li>
              <li>第二次：上傳尾款證明 → 老闆審 → 全額付清</li>
            </ul>
            日潛也可分批匯款，每次都到付款頁上傳即可。
          </>
        ),
      },
      {
        q: "如果付款證明傳錯了怎麼辦？",
        a: (
          <>
            到「我的預約 → 付款方式選擇」就能看到您上傳過的所有證明。
            <b>未審核</b>的可以直接刪除重傳，
            <b>已駁回</b>的會保留 + 顯示老闆說明，您可以依說明再上傳新的。
            <b>已核可</b>的不可動，如有疑問請聯絡老闆。
          </>
        ),
      },
      {
        q: "抵用金（Credit）是什麼？怎麼用？",
        a: (
          <>
            抵用金是 NT$ 1:1 的折抵點數，來源包括：註冊禮金、首單獎勵、生日抵用金、
            VIP 升等與滿級回饋、退款轉抵用金等。預約時可在「使用抵用金折抵」勾選，
            折抵金額會直接從總額扣除。<span className="opacity-70">（各項金額依實際狀況調整）</span>
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
            共 5 級，依**累積潛水次數**自動升等：
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              <div>🦐 <b>LV1 小蝦</b>：新會員</div>
              <div>🦞 <b>LV2 龍蝦</b>：累積 11 潛</div>
              <div>🐢 <b>LV3 海龜</b>：累積 51 潛</div>
              <div>🪼 <b>LV4 鬼蝠魟</b>：累積 101 潛</div>
              <div>🦈 <b>LV5 鯨鯊</b>：累積 201 潛</div>
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
            有！每次跨等級升等會發放抵用金到你的帳戶，金額依等級而定。
            另外完成註冊（Email 驗證）、首次潛水完成、生日當月也都有機會獲得抵用金。
            <span className="block mt-1 opacity-70">※ 各項金額與門檻可能依實際營運調整，以系統顯示與最新公告為準。</span>
          </>
        ),
      },
      {
        q: "VIP 有什麼福利？",
        a: (
          <>
            不同等級享有不同的優惠（例如裝備租借折扣、升等與滿級回饋抵用金等）。
            實際的優惠項目與折扣會在**下單時依您當前等級自動套用並顯示，以當下系統顯示為準**，
            海王子保留調整權利。您目前的等級可在「個人」分頁查看。
          </>
        ),
      },
    ],
  },
  {
    category: "安全注意事項",
    icon: <ShieldCheck className="h-4 w-4" />,
    items: [
      {
        q: "潛水安全與保險須知（重要）",
        a: (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-6">
            {linkifyPolicy(safetyPolicy)}
          </pre>
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
              <li>健保卡</li>
              <li>個人換洗衣物</li>
              <li>
                個人裝備自行攜帶（如需租借請透過系統登記，最晚須在
                2 天前提出申請）
              </li>
            </ul>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              🚿 潛水結束後，可至「打氣站」使用熱水沖洗。
            </p>
          </>
        ),
      },
      {
        q: "可以租借裝備嗎？費用？",
        a: (
          <>
            可以，預約時勾選需要的裝備即可，最晚須在
            <strong>潛水日 2 天前</strong>提出租借登記。
            費率依當前設定，可在預約頁面查看完整價目。建議租整套享優惠。
          </>
        ),
      },
      {
        q: "如果當天天氣不好怎麼辦？",
        a: (
          <>
            如風速超過安全門檻，會在前一天或當天早上發訊息通知取消。
            因天氣取消的場次，店家會協助辦理退款或轉抵用金，
            實際處理方式與金額依當下狀況與公告為準。場次取消不影響其他天的預約。
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
  const [safetyPolicy, setSafetyPolicy] = useState<string>("");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setCancellationPolicy(c.cancellationPolicy ?? "");
        setSafetyPolicy(c.safetyPolicy ?? "");
      })
      .catch(() => { /* fall back to empty - buildFaqs handles */ });
  }, []);
  const FAQS = buildFaqs(cancellationPolicy, safetyPolicy);
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
