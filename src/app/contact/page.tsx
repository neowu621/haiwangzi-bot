import type { Metadata } from "next";
import { SeoShell } from "../_seo/SeoShell";
import { ContactForm } from "./ContactForm";

// v533：公開客戶詢問頁 —— SSG/SEO 可索引。A 購買疑慮 → 客服信箱、B 開團許願 → 收需求。
export const metadata: Metadata = {
  title: "聯絡 / 詢問我們 ‧ 東北角海王子潛水",
  description:
    "對潛水課程、體驗潛水、OW/AOW 考證、Fun Dive、潛旅有疑問,或想揪團去綠島、蘭嶼、小琉球、墾丁?填表直接問東北角海王子潛水,或 LINE 汪汪教練。客服信箱 service@haiwangzi.xyz。",
  alternates: { canonical: "https://haiwangzi.xyz/contact" },
};

export default function ContactPage() {
  return (
    <SeoShell
      eyebrow="Contact"
      title="聯絡 / 詢問我們"
      subtitle="對課程、潛旅有疑問,或想揪團去某個潛點?填表問我們,或直接 LINE 汪汪教練 —— 客服信箱 service@haiwangzi.xyz。"
      current="/contact"
    >
      <ContactForm />
    </SeoShell>
  );
}
