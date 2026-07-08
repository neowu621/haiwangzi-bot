// v819：會員獎勵制度公開說明頁（/rewards）。
//   全域純靜態行銷內容 → 直接寫常數、零 DB（符合資料分層鐵則第 1 層）。
//   手機優先閱讀優化；CSS 全部 scope 在 .rwd 下，避免與全站樣式衝突。
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { getSiteConfigRow } from "@/lib/site-config-cache";
import { normalizeVipTiers } from "@/lib/vip-tier";

// v820：VIP 等級改「連動後台設定」——走版本號失效快取（getSiteConfigRow），
//   會員讀取命中快取＝零 DB；後台按「儲存 VIP 設定」自動失效、下一次讀即生效。
//   force-dynamic：每次請求跑 RSC（但快取命中仍零 DB），確保反映後台最新值、且 build 不需 DB。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "會員獎勵制度 ‧ 東北角海王子潛水",
  description:
    "東北角海王子潛水會員回饋：註冊＋Email 認證送 NT$50 抵用金、VIP 潛級升等禮金、生日禮金、首單獎勵、課程加贈 Fun Dive。越潛越深，福利越多。",
};

const tint = (c: string) => ({ ["--tint"]: c } as CSSProperties);
// 潛級由淺入深的視覺配色（依等級序，最高一律金色）
const TINTS = ["#7fb2c9", "#0e9f93", "#12a3ad", "#2f6fb0", "#f5b942"];
const tintFor = (i: number, total: number) => (i === total - 1 ? "#f5b942" : TINTS[Math.min(i, TINTS.length - 1)]);
// 福利文字裡的 NT$金額 / 折數 自動加粗
function highlight(text: string): ReactNode[] {
  return text.split(/(NT\$[\d,]+|\d+\s*折)/g).filter(Boolean).map((p, i) =>
    /^NT\$[\d,]+$/.test(p) || /^\d+\s*折$/.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>,
  );
}

const CSS = `
.rwd{
  --navy:#0A2342; --navy2:#0d2f57;
  --teal:#0e9f93; --teal-d:#0a7a70; --mint:#5fe0d0;
  --coral:#ff6b4a; --gold:#f5b942;
  --bg:#eaf1f6; --surface:#ffffff; --surface-2:#f2f7fb;
  --ink:#0A2342; --muted:#5b7288; --line:#d8e4ee;
  --shadow:0 6px 26px rgba(9,32,58,.10); --maxw:1000px;
  background:var(--bg); color:var(--ink);
  font-family:-apple-system,"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;
  line-height:1.7; -webkit-font-smoothing:antialiased;
}
.rwd *{box-sizing:border-box;}
.rwd .wrap{max-width:var(--maxw); margin:0 auto; padding:0 20px;}

.rwd .hero{position:relative; overflow:hidden; color:#fff; background:linear-gradient(170deg,#0e9f93 0%,#0c5f78 42%,#0A2342 100%); padding:60px 20px 84px;}
.rwd .hero-inner{max-width:var(--maxw); margin:0 auto; position:relative; z-index:2;}
.rwd .eyebrow{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:var(--mint); margin-bottom:16px;}
.rwd .eyebrow::before{content:""; width:26px; height:2px; background:var(--mint); display:inline-block;}
.rwd .hero h1{font-size:clamp(30px,6vw,52px); font-weight:900; line-height:1.12; margin:0 0 14px; letter-spacing:-.01em; text-wrap:balance;}
.rwd .hero h1 .hl{color:var(--mint);}
.rwd .hero p{font-size:clamp(15px,2.4vw,18px); max-width:52ch; color:#cfe6ef; margin:0 0 26px;}
.rwd .hero-stats{display:flex; flex-wrap:wrap; gap:26px 40px; margin-top:8px;}
.rwd .hstat b{display:block; font-size:clamp(22px,4vw,30px); font-weight:900; color:#fff;}
.rwd .hstat span{font-size:12.5px; color:#a9cdd8; letter-spacing:.04em;}
.rwd .bubbles{position:absolute; inset:0; z-index:1; pointer-events:none;}
.rwd .bubbles i{position:absolute; bottom:-30px; border-radius:50%; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.14); animation:rwd-rise linear infinite;}
@keyframes rwd-rise{to{transform:translateY(-120vh) translateX(14px); opacity:0;}}

.rwd section{padding:52px 0 8px;}
.rwd .sec-head{margin-bottom:26px;}
.rwd .sec-kicker{font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:var(--teal);}
.rwd .sec-head h2{font-size:clamp(22px,4vw,30px); font-weight:900; margin:6px 0 6px; letter-spacing:-.01em; text-wrap:balance;}
.rwd .sec-head p{color:var(--muted); margin:0; font-size:14.5px; max-width:60ch;}

.rwd .ladder{display:flex; flex-direction:column; gap:14px;}
.rwd .tier{position:relative; display:grid; grid-template-columns:88px 1fr; gap:18px; background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:20px 22px; box-shadow:var(--shadow); overflow:hidden;}
.rwd .tier::before{content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--tint,var(--teal));}
.rwd .tier-badge{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; background:var(--surface-2); border-radius:14px; padding:10px 4px;}
.rwd .tier-badge .em{font-size:34px; line-height:1;}
.rwd .tier-badge .lv{font-size:11px; font-weight:800; color:var(--muted); letter-spacing:.06em; margin-top:4px;}
.rwd .tier-main h3{margin:0; font-size:19px; font-weight:900; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;}
.rwd .tier-main h3 .en{font-size:12px; font-weight:600; color:var(--muted); letter-spacing:.08em; text-transform:uppercase;}
.rwd .req{display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:var(--tint,var(--teal)); background:color-mix(in srgb,var(--tint,var(--teal)) 12%,transparent); border-radius:999px; padding:3px 11px; margin:8px 0 12px;}
.rwd .perks{list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:6px 18px;}
.rwd .perks li{position:relative; padding-left:20px; font-size:13.5px; color:var(--ink);}
.rwd .perks li::before{content:"◆"; position:absolute; left:0; color:var(--tint,var(--teal)); font-size:10px; top:4px;}
.rwd .perks li b{color:var(--coral); font-variant-numeric:tabular-nums;}

.rwd .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(232px,1fr)); gap:14px;}
.rwd .card{background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px; box-shadow:var(--shadow); display:flex; flex-direction:column; gap:6px;}
.rwd .card .ic{font-size:24px;}
.rwd .card h4{margin:2px 0 0; font-size:15.5px; font-weight:800;}
.rwd .card .amt{font-size:22px; font-weight:900; color:var(--coral); font-variant-numeric:tabular-nums; letter-spacing:-.01em;}
.rwd .card .amt small{font-size:12px; font-weight:700; color:var(--muted);}
.rwd .card .desc{font-size:12.5px; color:var(--muted); line-height:1.6;}
.rwd .card .meta{margin-top:auto; padding-top:8px; font-size:11.5px; color:var(--teal); font-weight:700; border-top:1px dashed var(--line);}

.rwd .courses{display:flex; flex-direction:column; gap:12px;}
.rwd .course{display:grid; grid-template-columns:1fr auto; gap:6px 20px; align-items:start; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px 20px; box-shadow:var(--shadow);}
.rwd .course h4{margin:0; font-size:16px; font-weight:800;}
.rwd .course .price{font-size:18px; font-weight:900; color:var(--coral); font-variant-numeric:tabular-nums; white-space:nowrap;}
.rwd .course .bonus{grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;}
.rwd .chip{display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:600; background:var(--surface-2); border:1px solid var(--line); border-radius:999px; padding:4px 11px; color:var(--ink);}
.rwd .chip.gift{color:var(--teal-d); border-color:color-mix(in srgb,var(--teal) 35%,transparent); background:color-mix(in srgb,var(--teal) 9%,transparent);}

.rwd .split{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
.rwd .panel{background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:20px 22px; box-shadow:var(--shadow);}
.rwd .panel h3{margin:0 0 12px; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;}
.rwd .panel ul{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:8px;}
.rwd .panel li{font-size:13.5px; color:var(--ink);}
.rwd .panel li b{color:var(--teal-d);}
.rwd .panel.limited{background:linear-gradient(160deg,color-mix(in srgb,var(--coral) 12%,var(--surface)),var(--surface));}

.rwd .cta{margin:44px 0 12px; text-align:center; background:linear-gradient(160deg,var(--navy2),var(--navy)); color:#fff; border-radius:22px; padding:44px 24px;}
.rwd .cta h2{font-size:clamp(21px,4vw,28px); font-weight:900; margin:0 0 8px;}
.rwd .cta p{color:#bcd6e0; margin:0 auto 22px; max-width:44ch; font-size:14.5px;}
.rwd .btns{display:flex; gap:12px; justify-content:center; flex-wrap:wrap;}
.rwd .btn{display:inline-flex; align-items:center; gap:8px; font-size:14.5px; font-weight:800; border-radius:12px; padding:13px 22px; text-decoration:none; cursor:pointer;}
.rwd .btn.line{background:#06C755; color:#fff;}
.rwd .btn.ghost{background:rgba(255,255,255,.08); color:#fff; border:1px solid rgba(255,255,255,.28);}

.rwd .rfoot{color:var(--muted); font-size:12px; text-align:center; padding:26px 20px 50px; line-height:1.7;}
.rwd .rfoot a{color:var(--teal-d); font-weight:700; text-decoration:none;}

@media (max-width:600px){
  .rwd .wrap{padding:0 16px;}
  .rwd .hero{padding:44px 18px 60px;}
  .rwd .hero p{font-size:15px; line-height:1.75;}
  .rwd .hero-stats{gap:16px 24px;}
  .rwd .hstat b{font-size:22px;}
  .rwd .hstat span{font-size:11.5px;}
  .rwd section{padding:38px 0 4px;}
  .rwd .sec-head{margin-bottom:18px;}
  .rwd .sec-head p{font-size:14px;}
  .rwd .tier{display:block; padding:16px 18px;}
  .rwd .tier::before{width:4px;}
  .rwd .tier-badge{flex-direction:row; align-items:center; gap:9px; width:max-content; padding:7px 14px 7px 10px; border-radius:999px; margin-bottom:12px;}
  .rwd .tier-badge .em{font-size:26px;}
  .rwd .tier-badge .lv{margin-top:0; font-size:12px;}
  .rwd .tier-main h3{font-size:18px;}
  .rwd .req{margin:0 0 6px; font-size:13px;}
  .rwd .perks{grid-template-columns:1fr; gap:0;}
  .rwd .perks li{padding:11px 0 11px 22px; font-size:14.5px; line-height:1.55; border-bottom:1px solid var(--line);}
  .rwd .perks li:last-child{border-bottom:none; padding-bottom:2px;}
  .rwd .perks li::before{top:15px;}
  .rwd .grid{grid-template-columns:1fr; gap:11px;}
  .rwd .card{flex-direction:row; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:15px 16px;}
  .rwd .card .ic{font-size:26px; flex:none;}
  .rwd .card h4{flex:1; font-size:15.5px;}
  .rwd .card .amt{width:100%; order:3; font-size:21px;}
  .rwd .card .desc{width:100%; order:4; font-size:13px;}
  .rwd .card .meta{width:100%; order:5; margin-top:8px;}
  .rwd .course{grid-template-columns:1fr; padding:16px 18px;}
  .rwd .course .price{font-size:20px;}
  .rwd .split{grid-template-columns:1fr; gap:12px;}
  .rwd .panel{padding:18px;}
  .rwd .panel li{font-size:14px; line-height:1.6;}
  .rwd .cta{padding:36px 20px; border-radius:18px;}
  .rwd .btns{flex-direction:column;}
  .rwd .btn{width:100%; justify-content:center; padding:14px;}
}
@media (max-width:360px){
  .rwd .hero h1{font-size:27px;}
  .rwd .tier-main h3 .en{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .rwd .bubbles i{animation:none; display:none;}
}
`;

export default async function RewardsPage() {
  // 命中記憶體快取＝零 DB；後台存 VIP 設定自動失效。DB 掛掉則 fallback 內建預設，頁面照常渲染。
  let cfg: Awaited<ReturnType<typeof getSiteConfigRow>> = null;
  try { cfg = await getSiteConfigRow(); } catch { cfg = null; }
  const tiers = [...normalizeVipTiers(cfg?.vipTiers)].sort((a, b) => a.level - b.level);
  const total = tiers.length;
  // 「VIP 升等禮金」卡片金額範圍：由各級 upgradeCredit 動態推出（同樣連動後台）
  const ucs = tiers.map((t) => t.upgradeCredit).filter((c) => c > 0);
  const ucMin = ucs.length ? Math.min(...ucs) : 0;
  const ucMax = ucs.length ? Math.max(...ucs) : 0;

  return (
    <main className="rwd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="hero">
        <div className="bubbles" aria-hidden="true">
          <i style={{ left: "8%", width: 14, height: 14, animationDuration: "15s" }} />
          <i style={{ left: "22%", width: 9, height: 9, animationDuration: "11s", animationDelay: "2s" }} />
          <i style={{ left: "38%", width: 20, height: 20, animationDuration: "19s", animationDelay: "1s" }} />
          <i style={{ left: "55%", width: 11, height: 11, animationDuration: "13s", animationDelay: "4s" }} />
          <i style={{ left: "70%", width: 16, height: 16, animationDuration: "17s" }} />
          <i style={{ left: "84%", width: 8, height: 8, animationDuration: "10s", animationDelay: "3s" }} />
          <i style={{ left: "92%", width: 13, height: 13, animationDuration: "16s", animationDelay: "2s" }} />
        </div>
        <div className="hero-inner">
          <span className="eyebrow">東北角海王子潛水 · 會員回饋</span>
          <h1>越潛越深，<span className="hl">福利越多</span>。</h1>
          <p>從註冊那一刻起，每一次下水都在累積回饋。抵用金、生日禮金、VIP 等級與升等獎勵——潛得越深，海王子回饋得越多。</p>
          <div className="hero-stats">
            <div className="hstat"><b>5 級</b><span>VIP 潛級制度</span></div>
            <div className="hstat"><b>NT$50 起</b><span>註冊＋Email 認證即送</span></div>
            <div className="hstat"><b>1:1</b><span>抵用金直接折現</span></div>
          </div>
        </div>
      </header>

      <div className="wrap">
        <section id="vip">
          <div className="sec-head">
            <span className="sec-kicker">VIP 潛級 · 越潛越深</span>
            <h2>五個潛級，一路潛向鯨鯊</h2>
            <p>升級只看你在海王子的<b>累積潛次</b>（一場 3 潛＝3 次），與消費金額無關。每升一級都自動送升等禮金，潛得越深、回饋越高。</p>
          </div>
          <div className="ladder">
            {tiers.map((t, i) => {
              const isLast = i === total - 1;
              const req = t.minLogs <= 0
                ? "🐚 新會員 · 0 潛起"
                : `🤿 累積 ${t.minLogs} 潛${isLast ? " · 最高等級" : ""}`;
              return (
                <article className="tier" style={tint(tintFor(i, total))} key={t.key || t.level}>
                  <div className="tier-badge"><span className="em">{t.emoji}</span><span className="lv">LV{t.level}</span></div>
                  <div className="tier-main">
                    <h3>{t.name} {t.enName && <span className="en">{t.enName}</span>}</h3>
                    <span className="req">{req}</span>
                    <ul className="perks">
                      {t.upgradeCredit > 0 && (
                        <li>升等禮金 <b>NT${t.upgradeCredit.toLocaleString()}</b></li>
                      )}
                      {t.benefits.map((b, j) => (
                        <li key={j}>{highlight(b)}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="credits">
          <div className="sec-head">
            <span className="sec-kicker">抵用金 · 一元一點</span>
            <h2>五種抵用金，自動入帳、下單直接折</h2>
            <p>抵用金 <b>1 元＝1 點</b>，下單時直接折抵現金，且可與各項優惠<b>疊加</b>使用。以下為標準發放規則。</p>
          </div>
          <div className="grid">
            <div className="card">
              <span className="ic">🎁</span><h4>註冊禮金</h4>
              <div className="amt">NT$50</div>
              <div className="desc">完成 Email 認證後自動入帳，一生一次。</div>
              <div className="meta">♾ 永久有效</div>
            </div>
            <div className="card">
              <span className="ic">🎂</span><h4>生日禮金</h4>
              <div className="amt">NT$100</div>
              <div className="desc">每年生日當月自動送，一年一次（需先填生日）。</div>
              <div className="meta">⏳ 360 天內使用</div>
            </div>
            <div className="card">
              <span className="ic">🎉</span><h4>首單獎勵</h4>
              <div className="amt">NT$100</div>
              <div className="desc">完成第一次潛水到場後自動入帳，新朋友專屬。</div>
              <div className="meta">⏳ 360 天內使用</div>
            </div>
            <div className="card">
              <span className="ic">⭐</span><h4>VIP 升等禮金</h4>
              <div className="amt">NT${ucMin.toLocaleString()}<small> ~ {ucMax.toLocaleString()}</small></div>
              <div className="desc">每升一個潛級自動發放，逐級補發不漏接。</div>
              <div className="meta">⏳ 360 天內使用</div>
            </div>
            <div className="card">
              <span className="ic">🏆</span><h4>滿級回饋</h4>
              <div className="amt">NT$1,500<small> / 50 潛</small></div>
              <div className="desc">升上 LV5 鯨鯊後，每再累積 50 潛就再送一次。</div>
              <div className="meta">⏳ 360 天內使用</div>
            </div>
            <div className="card">
              <span className="ic">🔄</span><h4>退款轉抵用金</h4>
              <div className="amt">個案</div>
              <div className="desc">符合條件的退款可轉為抵用金，下次下單更方便。</div>
              <div className="meta">♾ 不限使用期限</div>
            </div>
          </div>
        </section>

        <section id="courses">
          <div className="sec-head">
            <span className="sec-kicker">課程加贈 · 學完就潛</span>
            <h2>考證不只拿一張卡，還多幾支氣瓶</h2>
            <p>報名 OW / AOW 考證課程，結業直接加贈 Fun Dive 與租裝備福利，讓你考完馬上開始累積潛次。</p>
          </div>
          <div className="courses">
            <div className="course">
              <div>
                <h4>🌊 體驗潛水（免證照）</h4>
                <div className="bonus">
                  <span className="chip gift">🎁 含全套裝備</span>
                  <span className="chip gift">📷 含基本水下照相</span>
                </div>
              </div>
              <div className="price">NT$2,500</div>
            </div>
            <div className="course">
              <div>
                <h4>🥽 OW 開放水域潛水員（保證班）</h4>
                <div className="bonus">
                  <span className="chip gift">🎁 加贈 1 天 Fun Dive（3 支氣瓶）</span>
                  <span className="chip gift">🏝 結業一年內：外島＋國外旅行各 1 次免費租裝備</span>
                  <span className="chip">訂金 NT$6,000</span>
                </div>
              </div>
              <div className="price">NT$14,500</div>
            </div>
            <div className="course">
              <div>
                <h4>🎯 AOW 進階開放水域潛水員</h4>
                <div className="bonus">
                  <span className="chip gift">🎁 加贈 1 天 Fun Dive（3 支氣瓶）</span>
                  <span className="chip gift">💨 加購高氧（Nitrox）證照優惠價 NT$3,500</span>
                  <span className="chip">訂金 NT$6,000</span>
                </div>
              </div>
              <div className="price">NT$14,500</div>
            </div>
          </div>
        </section>

        <section id="more">
          <div className="split">
            <div className="panel limited">
              <h3>🔥 不定期限時優惠</h3>
              <ul>
                <li><b>氣瓶限時折扣</b>：檔期內每支氣瓶現折固定金額（例：每支現折 NT$25）。</li>
                <li><b>優惠代碼</b>：節慶／活動代碼，每支氣瓶折 NT$ 或訂單打 % 折；與氣瓶折扣取其優，仍可再疊抵用金。</li>
                <li><b>日潛早鳥回饋</b>：提早預約且滿額，訂單結案後回饋抵用金，越早送越多。</li>
                <li style={{ color: "var(--muted)", fontSize: "12.5px" }}>實際檔期與金額以官網或 LINE 官方帳號公告為準。</li>
              </ul>
            </div>
            <div className="panel">
              <h3>📌 使用規則重點</h3>
              <ul>
                <li>抵用金 <b>1 元＝1 點</b>，下單時直接折抵，<b>可與各項折扣疊加</b>。</li>
                <li>VIP 升級只看 <b>海王子累積潛次</b>（一場 3 潛＝3 次），<b>與消費金額無關</b>。</li>
                <li>升等禮金<b>每級只發一次</b>，降級再升回不重複發。</li>
                <li>有抵用期限者，<b>到期前 7 天</b>會提醒，逾期自動失效。</li>
                <li>報名／確認名額請透過 LINE 官方帳號 <b>@894bpmew</b>。</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <div className="cta">
            <h2>現在加入，先領 NT$50 抵用金 🐠</h2>
            <p>用 LINE 註冊會員並完成 Email 認證，NT$50 抵用金馬上入帳，下次下單就能折。</p>
            <div className="btns">
              <a className="btn line" href="https://line.me/R/ti/p/@894bpmew" target="_blank" rel="noopener noreferrer">💬 加 LINE 加入會員</a>
              <a className="btn ghost" href="/schedule">📅 看最近場次</a>
            </div>
          </div>
        </section>
      </div>

      <div className="rfoot">
        東北角海王子潛水 · 安全．專業，陪你看見海<br />
        本頁為會員獎勵制度總覽；實際發放金額、限時檔期與折扣以系統設定與官方公告為準。<br />
        <a href="/">← 回官網首頁</a>
      </div>
    </main>
  );
}
