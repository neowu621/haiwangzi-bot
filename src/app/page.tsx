// v402：東北角海王子 — 公開行銷首頁（移植自原型「藍色實拍版」）。
// v429：重構為 Server Component + 局部 Client Island。
//   - 大量靜態文字（hero / #start / SPOTS / TRIPS / about / COURSES / reviews / FAQ / footer 等）
//     直接在 server 渲染，移出首屏 client JS bundle、降低 hydration / TBT。
//   - 互動部分抽成 client island：SiteNav（nav + 手機選單 + dotnav scroll-spy）、
//     Bubbles（hero 泡泡）、NewsVideos（影片牆 + lightbox）。
//   - FAQ 改用原生 <details><summary> 在 server 渲染，達成零 JS 開合。
//   - .reveal 進場動畫已是純 CSS（animation:hw-reveal both），不再需要 JS observer。
import type { Metadata } from "next";
import Image from "next/image";
import "./home.css";
import { APP_VERSION } from "@/lib/version";
import SiteNav from "./_home/SiteNav";
import Bubbles from "./_home/Bubbles";
import NewsVideos from "./_home/NewsVideos";
import {
  LINE_BOOK_URL, YT_CHANNEL, IG_URL, FB_URL, NAV,
  COURSES, SPOTS, TRIPS, LVL_CLASS,
  BUILTIN_REVIEWS, FAQ, LineIcon, FbIcon, YtIcon, IgIcon,
} from "./_home/data";
import { localBusinessJsonLd } from "@/lib/business-info";

// v499：首頁專屬 SEO metadata（取代 layout 的通用「潛水預約系統」）+ 自我 canonical 指向正規網址
export const metadata: Metadata = {
  title: "東北角海王子潛水 ‧ 萊萊鶯歌石潛水基地 ‧ 汪汪教練",
  description: "東北角潛水首選——汪汪教練帶你安心探索水下世界。免證照體驗潛水、OW/AOW 考證、Fun Dive 練功、東北角潛點與國內外潛旅，新手也能安心下水。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "東北角海王子潛水 ‧ 汪汪教練帶你安心潛水",
    description: "體驗潛水・OW/AOW 考證・Fun Dive 練功・東北角潛點與潛旅。新手也能安心下水。",
    url: "/",
  },
};

export default function HomePage() {
  // v497：LocalBusiness 結構化資料 — Google 商家卡 / 地圖 / 在地搜尋
  const bizJsonLd = localBusinessJsonLd();
  // v414：學員怎麼說改為內建固定內容（後台編輯已取消）
  // v461：總結語移除（標題區 intro 已有「安心」結論，重複）
  const reviews = BUILTIN_REVIEWS;

  return (
    <div className="hw">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bizJsonLd) }} />
      {/* v422：字體改用 layout 的 next/font 自架，移除 render-blocking 的 Google Fonts <link>（LINE webview 加速） */}
      {/* v429：nav + 手機選單 + dotnav scroll-spy 是 client island */}
      <SiteNav />

      <section className="hero" id="top">
        <div className="hero-bg" />
        <span className="light-shaft s1" /><span className="light-shaft s2" /><span className="light-shaft s3" />
        {/* v429：泡泡產生器是 client island */}
        <Bubbles />
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Lailai Yingge Rock · Northeast Coast</p>
            <h1>潛入大海<br />看見<span className="hl">另一個世界</span></h1>
            <p className="lead">剛入門、還在摸索都沒關係——有海王子教練「汪汪」在身邊，每一潛都安心。你只要放鬆，盡情擁抱大海。</p>
            <div className="hero-cta">
              <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon />LINE 立即預約</a>
              <a href="#start" className="btn btn-ghost">第一次潛水？看這裡</a>
            </div>
          </div>
          <div className="hero-coach">
            {/* v423：改 next/image — 手機只載 ~360px 寬版本（省流量），保留 priority 首屏優先 */}
            <Image
              src="/home/src-hero.webp"
              alt="東北角海王子潛水教練 汪汪"
              width={840}
              height={840}
              priority
              sizes="(max-width: 979px) 360px, 440px"
            />
            <span className="tagpill">潛水教練 ｜ 海王子．汪汪</span>
          </div>
        </div>
        <div className="scroll-hint">SCROLL<i /></div>
      </section>

      {/* v463：版面順序調整 — 學員故事(含「為什麼跟汪汪潛」intro) → 關於汪汪 → 課程 提前到 Hero 之後 */}
      <section className="reviews" id="reviews">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Student Voices</span>
            <h2 className="section-title">學員怎麼說</h2>
            <p className="rev-intro">每位學員的起點都不一樣——怕水的、剛拿證照的、想挑戰更深的海的；<br />但他們信任汪汪的理由，始終只有一個</p>
            <div className="rev-keyword">安心</div>
            <p className="rev-intro-end"><b>還在猶豫該找哪位教練？</b>聽聽他們怎麼說，你就懂了。</p>
          </div>
          {reviews.length > 0 && (() => {
            const f = reviews[0];
            return (
              <div className="rev-featured reveal">
                <div className="photo">
                  <div className="fphoto" style={f.avatar ? { backgroundImage: `url(${f.avatar})` } : undefined}>
                    {!f.avatar && f.name ? <span>{f.name.slice(0, 1)}</span> : null}
                  </div>
                </div>
                <div className="body">
                  <div className="stars">★★★★★</div>
                  <div className="who"><b>{f.name}</b>{f.activity ? <small>{f.activity}</small> : null}</div>
                  {f.title ? <h4>{f.title}</h4> : null}
                  <p>{f.text}</p>
                </div>
              </div>
            );
          })()}
          <div className="rev-grid">
            {reviews.slice(1).map((r, i) => {
              const img = r.photo || r.avatar;
              return (
                <div key={`${r.name}-${i}`} className="rev has-photo reveal">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="rev-banner" src={img} alt={r.title || r.name} loading="lazy" decoding="async" />
                  ) : (
                    <div className="rev-banner rev-banner-ph">{r.name ? <span>{r.name.slice(0, 1)}</span> : null}</div>
                  )}
                  <div className="stars">★★★★★</div>
                  <b className="rev-name">{r.name}</b>
                  {r.title ? <h4>{r.title}</h4> : null}
                  <p>{r.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="about" id="about">
        <div className="wrap about-grid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="about-photo reveal"><img src="/home/src-about.webp" alt="東北角海王子潛水教練 汪汪" loading="lazy" decoding="async" /><div className="badge">潛水教練 ｜ 海王子．汪汪 ｜ 信任．安全</div></div>
          <div className="about-text reveal">
            <span className="eyebrow">About the Diver</span>
            <h2 className="section-title">嗨，我是汪汪</h2>
            <p>潛水這件事，最重要的從來不是裝備有多好，而是帶你下水的人夠不夠專業、夠不夠細心。從第一次教學到現在，我最在意的就是兩個字——「安心」。</p>
            <p>無論你是完全沒碰過水的新手，還是想精進的進階潛水員，我都會依照你的狀況，把節奏調到最舒服，讓你把注意力放在欣賞海裡的世界。</p>
            <div className="stats">
              <div className="stat"><b>10+</b><small>教學年資</small></div>
              <div className="stat"><b>10,000+</b><small>潛水次數</small></div>
              <div className="stat"><b>1,000+</b><small>累積潛水人數</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* v413：潛水課程 */}
      <section className="courses" id="courses">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Diving Courses</span><h2 className="section-title">潛水課程</h2>
            <p className="sec-sub">從零基礎到進階，跟著汪汪一步步把證照變成真正的能力——課程時間可彈性安排。</p>
          </div>
          <div className="course-grid">
            {COURSES.map((c) => (
              <div key={c.title} className="course-card reveal">
                <span className="badge">{c.badge}</span>
                <h3>{c.title}</h3>
                <div className="price-row"><span className={`price${c.price.startsWith("NT$") ? "" : " ask"}`}>{c.price}</span><span className="incl">{c.includes}</span></div>
                <ul>
                  {c.items.map((it, i) => (
                    <li key={i} className={it.hl ? "hl" : ""}><i /><span>{it.t}</span></li>
                  ))}
                </ul>
                <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line course-cta"><LineIcon />LINE 報名・諮詢</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* v424t：新手第一次潛水流程（4 步驟） */}
      <section className="startflow" id="start">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">First Dive · Step by Step</span><h2 className="section-title">第一次潛水，這樣開始</h2><p>完全沒碰過水也別緊張——汪汪會全程陪著你，一步一步來，你只要放鬆呼吸。</p></div>
          <div className="flow-grid reveal">
            <div className="flow-step"><span className="fn">1</span><h3>LINE 諮詢・預約</h3><p>告訴汪汪你的狀況與想潛的日期，幫你安排合適的時間與地點。</p></div>
            <div className="flow-step"><span className="fn">2</span><h3>淺水區適應</h3><p>先在淺水慢慢熟悉用嘴呼吸與裝備，確認你準備好了才往下。</p></div>
            <div className="flow-step"><span className="fn">3</span><h3>教練陪同下潛</h3><p>汪汪全程在你身邊，節奏由你決定，不勉強、不趕進度。</p></div>
            <div className="flow-step"><span className="fn">4</span><h3>上岸看美照</h3><p>教練會背專業相機側拍，上岸帶走滿滿的水下回憶。</p></div>
          </div>
          <div className="flow-cta reveal">
            <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon />LINE 諮詢第一次潛水</a>
          </div>
        </div>
      </section>

      <section className="poi-sec alt" id="spots">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Northeast Coast Dive Sites</span><h2 className="section-title">東北角潛點</h2><p>海王子常帶隊的東北角潛點，地形與生態各有特色，依你的程度與想看的風景安排。</p><p className="sec-hint">🐠 剛拿證照、想穩定技巧？推薦從 <b>潮境 / 深澳</b> 開始練功。</p></div>
          <div className="poi-grid">
            {SPOTS.map((s) => (
              <div key={s.n} className={`poi ${s.bg} reveal`}><span className="num">{s.n}</span>{s.level ? <span className={`lvl lvl-${LVL_CLASS[s.level] || "mid"}`}>{s.level}</span> : null}<div className="poi-body"><h3>{s.zh}<span>{s.en}</span></h3><p>{s.d}</p><div className="poi-meta">{s.tags.map((t) => <span key={t}>{t}</span>)}</div></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="poi-sec" id="trips">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">Dive Trip Destinations</span><h2 className="section-title">潛旅目的地</h2><p>跟著海王子玩遍國內外潛點，教練全程帶隊，玩潛水也玩旅遊，名額有限。</p></div>
          <div className="poi-grid">
            {TRIPS.map((s) => (
              <div key={s.zh} className={`poi ${s.bg} reveal`}><span className="num">{s.n}</span>{s.level ? <span className={`lvl lvl-${LVL_CLASS[s.level] || "mid"}`}>{s.level}</span> : null}<div className="poi-body"><h3>{s.zh}<span>{s.en}</span></h3><p>{s.d}</p><div className="poi-meta">{s.tags.map((t) => <span key={t}>{t}</span>)}</div></div></div>
            ))}
          </div>
          {/* v424t：進階潛水員 — 挑戰敘事 + 找潛伴（P3） */}
          <div className="adv-callout reveal">
            <div className="adv-card">
              <span className="eyebrow">For Experienced</span>
              <h3>想被挑戰？</h3>
              <p>急流地形、二戰沈船、清晨守候長尾鯊——進階硬點汪汪罩得住。把你想攻的點丟給他，一起規劃路線與深度。</p>
            </div>
            <div className="adv-card">
              <span className="eyebrow">Solo Divers</span>
              <h3>自己一個人？</h3>
              <p>單人也能加入。跟著教練併團出發，輕鬆找到同程度的潛伴，不用揪團也能下水。併團資訊直接 LINE 問。</p>
            </div>
          </div>
        </div>
      </section>

      {/* v429：最新動態影片牆是 client island（fetch /api/config + facade + lightbox） */}
      <section className="news" id="news">
        <NewsVideos />
      </section>

      {/* v429：FAQ 改用原生 <details><summary>，server 渲染、零 JS 開合 */}
      <section className="faq" id="faq">
        <div className="wrap">
          <div className="sec-head reveal"><span className="eyebrow">FAQ</span><h2 className="section-title">下水前，先把問題問清楚</h2><p>新手最常問的問題與安全須知都整理在這裡，有任何疑問也歡迎直接 LINE 問汪汪。</p></div>
          <div className="faq-list reveal">
            {FAQ.map((cat) => (
              <div key={cat.zh}>
                <div className="faq-cat"><span className="zh">{cat.zh}</span><span className="en">{cat.en}</span></div>
                {cat.items.map((qa) => (
                  <details key={cat.zh + qa.q} className="qa">
                    <summary>{qa.q}<span className="ic" /></summary>
                    <div className="ans">{typeof qa.a === "string" ? <p>{qa.a}</p> : qa.a}</div>
                  </details>
                ))}
              </div>
            ))}
          </div>
          <div className="faq-consent reveal">✅ 完成預約即視同同意以上安全須知與活動內容。<br />潛水安全第一，如果有任何不適，請不要勉強；海永遠都在，身體健康與安全最重要。<br />🌊 東北角海王子 感謝您的信任，期待與你一起安全探索海洋。</div>
        </div>
      </section>

      <section className="booking" id="book">
        <div className="wrap reveal">
          <span className="eyebrow">Let&apos;s Dive</span>
          <h2>準備好下水了嗎？</h2>
          <p>加入官方 LINE，告訴汪汪你想潛的日期與人數，幫你把行程安排好。單人報名也 OK，現場幫你找潛伴。</p>
          <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon s={20} />加 LINE 預約潛水</a>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-tag"><div className="zh">守護海洋 · 敬畏自然 · 探索深藍</div><div className="en">Protect · Respect · Explore</div></div>
          {/* v496：深入了解 — 連到獨立可索引頁（內部連結幫助 Google 爬取與收錄） */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 30 }}>
            {[
              { href: "/course", label: "潛水課程" },
              { href: "/pricing", label: "費用價目" },
              { href: "/northsea-diving", label: "東北角潛點" },
              { href: "/comment", label: "學員評價" },
              { href: "/haiwangzi", label: "關於汪汪教練" },
              { href: "/faq", label: "常見問題" },
              { href: "/safety", label: "潛水安全" },
            ].map((p) => (
              <a key={p.href} href={p.href} style={{ border: "1px solid rgba(255,255,255,.22)", borderRadius: 999, padding: "7px 15px", fontSize: ".86rem", color: "var(--mist)", textDecoration: "none" }}>{p.label}</a>
            ))}
          </div>
          <div className="foot-grid">
            <div className="foot-col">
              <h5>東北角海王子</h5>
              <p>東北角潛水．萊萊鶯歌石潛水基地．教練汪汪帶你安心探索水下世界。</p>
              <div className="socials">
                <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><YtIcon s={38} /></a>
                <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><IgIcon s={38} uid="ft" /></a>
                <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><FbIcon s={38} /></a>
              </div>
            </div>
            {/* v461：探索拆兩欄（各 4 個連結），視覺平衡 */}
            <div className="foot-col"><h5>探索</h5>{NAV.slice(0, 4).map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}</div>
            <div className="foot-col"><h5 aria-hidden="true">&nbsp;</h5>{NAV.slice(4).map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}</div>
            <div className="foot-col"><h5>預約</h5><a href={LINE_BOOK_URL} target="_blank" rel="noopener">LINE 預約潛水</a></div>
          </div>
          <div className="foot-bottom">© {new Date().getFullYear()} 東北角海王子 Northeast Coast Ocean Prince · 探索海洋 · 安全潛水 · 專業教學</div>
          <div className="foot-version" style={{ textAlign: "center", fontSize: 10, opacity: 0.45, padding: "6px 0 2px", letterSpacing: "0.05em" }}>
            v{APP_VERSION}
          </div>
        </div>
      </footer>

      <div className="mobile-book">
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" className="btn btn-line"><LineIcon />LINE 立即預約</a>
      </div>
    </div>
  );
}
