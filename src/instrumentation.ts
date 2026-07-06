// v811：開機執行一次（Next.js instrumentation register hook，Node 16.2 穩定）。
//   用途：LINE 環境變數「改名相容層」——把命名不清楚的舊變數統一成有前綴的新名。
//
//   問題：`LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` 看不出是 Messaging API，
//         容易和 `LINE_LOGIN_CHANNEL_SECRET`（登入）、`LINE_LIFF_CHANNEL_ID`（LIFF）搞混。
//   解法：新增有前綴的新名 `LINE_MSGAPI_*`；程式底層仍讀舊名，這裡在開機時把
//         「新名 → 舊名」補齊，達成零斷線：
//           · Zeabur 只設新名 → 這裡補上舊名，程式照常運作。
//           · Zeabur 仍是舊名 → 舊名已存在，維持不動（向後相容）。
//           · 兩者都設     → 舊名優先（不覆蓋），行為明確。
//
//   單一 Node 容器（Zeabur）：register() 在主程序啟動時跑一次，之後所有 nodejs
//   route handler 讀到的 process.env 都是同一份，故補齊會全域生效。
export function register() {
  // 只在 Node runtime 做（Edge 的 process.env 改動不保證持久；LINE 相關路由都是 nodejs）
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // 新名（有 MSGAPI 前綴，清楚） → 舊名（程式底層仍讀舊名）
  const aliases: [newName: string, oldName: string][] = [
    ["LINE_MSGAPI_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN"],
    ["LINE_MSGAPI_CHANNEL_SECRET", "LINE_CHANNEL_SECRET"],
  ];
  for (const [newName, oldName] of aliases) {
    if (!process.env[oldName] && process.env[newName]) {
      process.env[oldName] = process.env[newName];
    }
  }
}
