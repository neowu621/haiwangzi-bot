import type { Metadata } from "next";
import { LegalShell, LegalSection } from "../_legal/LegalShell";

export const metadata: Metadata = {
  title: "隱私權政策 ‧ 東北角海王子潛水",
  description: "東北角海王子潛水會員服務隱私權政策",
};

// v481：隱私權政策（標準範本，老闆可依實際情況調整文字）
export default function PrivacyPage() {
  return (
    <LegalShell title="隱私權政策" updated="2026-06-11">
      <p style={{ marginTop: 0 }}>
        東北角海王子潛水（以下簡稱「本站」）非常重視您的個人資料保護。本政策說明我們如何蒐集、使用與保護您於使用會員預約服務時所提供的資料。當您註冊或使用本站服務，即表示您已閱讀並同意本政策。
      </p>

      <LegalSection no={1} title="我們蒐集的資料">
        <ul style={{ paddingLeft: 20, margin: "6px 0" }}>
          <li>LINE 帳號識別資訊（顯示名稱、使用者識別碼），用於辨識會員身分。</li>
          <li>電子郵件地址，用於寄送預約確認、開課提醒與重要服務通知。</li>
          <li>您主動填寫的聯絡與潛水資料：姓名、電話、緊急聯絡人、潛水證照等級與次數等。</li>
          <li>預約與付款相關紀錄（場次、金額、付款證明、簽署文件）。</li>
        </ul>
      </LegalSection>

      <LegalSection no={2} title="電子郵件地址的使用目的">
        <p style={{ margin: "6px 0" }}>我們僅將您的電子郵件用於下列用途：</p>
        <ul style={{ paddingLeft: 20, margin: "6px 0" }}>
          <li>寄送課程預約確認與報名結果通知。</li>
          <li>開課提醒、課程時間異動或取消通知。</li>
          <li>潛點活動、揪團出團等重要資訊通知。</li>
          <li>會員帳號安全與重要服務通知。</li>
        </ul>
        <p style={{ margin: "6px 0" }}>我們<b>不會</b>將電子郵件提供給第三方，亦<b>不會</b>用於未經您同意的行銷訊息。</p>
      </LegalSection>

      <LegalSection no={3} title="資料的保護與保存">
        <p style={{ margin: "6px 0" }}>
          您的資料儲存於受存取控制保護的資料庫，付款證明與簽署文件以加密金鑰保護。我們僅在提供服務及法令要求之必要期間內保存您的資料。
        </p>
      </LegalSection>

      <LegalSection no={4} title="您的權利">
        <p style={{ margin: "6px 0" }}>
          您可隨時於會員設定中查詢、更正您的個人資料，或調整通知偏好（LINE／Email）。如需刪除帳號或停止接收通知，請透過 LINE 官方帳號與我們聯繫。
        </p>
      </LegalSection>

      <LegalSection no={5} title="Cookie 與登入狀態">
        <p style={{ margin: "6px 0" }}>
          為維持您的登入狀態，本站會在您的瀏覽器存放必要的登入憑證（cookie）。此憑證僅用於辨識您的會員身分，不會用於跨站追蹤。
        </p>
      </LegalSection>

      <LegalSection no={6} title="政策修訂與聯絡方式">
        <p style={{ margin: "6px 0" }}>
          本政策如有修訂，將於本頁公告。如對本政策有任何疑問，歡迎透過本站 LINE 官方帳號與我們聯繫。
        </p>
      </LegalSection>
    </LegalShell>
  );
}
