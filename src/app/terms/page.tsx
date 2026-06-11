import type { Metadata } from "next";
import { LegalShell, LegalSection } from "../_legal/LegalShell";

export const metadata: Metadata = {
  title: "服務條款 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水會員服務條款",
};

// v481：服務條款（標準範本，老闆可依實際營運政策調整文字）
export default function TermsPage() {
  return (
    <LegalShell title="服務條款" updated="2026-06-11">
      <p style={{ marginTop: 0 }}>
        歡迎使用東北角海王子潛水（以下簡稱「本站」）的會員預約服務。當您註冊成為會員或使用本站任何服務，即表示您同意遵守本服務條款。
      </p>

      <LegalSection no={1} title="會員資格">
        <p style={{ margin: "6px 0" }}>
          您需使用 LINE 帳號完成註冊。您應確保所提供之姓名、電話、緊急聯絡人與潛水證照等資料正確且為最新，以保障您的潛水安全與權益。
        </p>
      </LegalSection>

      <LegalSection no={2} title="預約與付款">
        <ul style={{ paddingLeft: 20, margin: "6px 0" }}>
          <li><b>一日潛水</b>：採一次付清。完成預約後請依付款頁指示完成匯款並上傳轉帳證明。</li>
          <li><b>旅遊潛水（潛旅）</b>：採訂金 + 尾款。下單後先繳訂金保留名額，尾款於出發前依公告期限繳清。</li>
          <li>預約須經管理員核對款項後始確認成立。</li>
        </ul>
      </LegalSection>

      <LegalSection no={3} title="取消與退款">
        <p style={{ margin: "6px 0" }}>
          取消與退款依本站公告之退款政策辦理。因天候、海況不適合下水而取消之場次，您可選擇改期或全額退費（部分情況可選擇轉抵用金並享加成）。實際退款方式與金額以管理員確認為準。
        </p>
      </LegalSection>

      <LegalSection no={4} title="潛水安全與免責">
        <p style={{ margin: "6px 0" }}>
          潛水為具風險之活動。您應據實申報健康狀況與潛水經驗，並遵守教練之安全指示。若您隱匿重要健康資訊或不遵守安全規範，本站得拒絕提供服務，並不負因此所生之責任。完成預約即視同您已閱讀並同意相關安全須知。
        </p>
      </LegalSection>

      <LegalSection no={5} title="抵用金與會員權益">
        <p style={{ margin: "6px 0" }}>
          抵用金、生日禮金、VIP 等級等會員權益依本站當時公告之規則辦理，本站保留調整之權利。抵用金不得兌換現金，並有使用期限。
        </p>
      </LegalSection>

      <LegalSection no={6} title="條款修訂">
        <p style={{ margin: "6px 0" }}>
          本站得隨時修訂本條款並於本頁公告。修訂後您若繼續使用服務，視為同意修訂內容。如對本條款有任何疑問，歡迎透過本站 LINE 官方帳號與我們聯繫。
        </p>
      </LegalSection>
    </LegalShell>
  );
}
