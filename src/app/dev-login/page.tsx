"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DevPersona {
  lineUserId: string;
  displayName: string;
  realName: string;
  roles: string[];
  cert?: string;
  emoji: string;
  description: string;
}

export default function DevLoginPage() {
  const [personas, setPersonas] = useState<DevPersona[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // 列 personas
    fetch("/api/dev/login")
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`HTTP ${r.status}: ${t}`);
        }
        return r.json();
      })
      .then((d) => setPersonas(d.personas))
      .catch((e) => setErr(e.message));
    // 讀目前選擇
    if (typeof window !== "undefined") {
      setCurrentId(localStorage.getItem("devPersona"));
    }
  }, []);

  async function pick(p: DevPersona) {
    setBusy(p.lineUserId);
    setErr(null);
    try {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineUserId: p.lineUserId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      // 寫 localStorage → LiffProvider 會讀
      localStorage.setItem("devPersona", p.lineUserId);
      localStorage.setItem("devPersonaName", p.displayName);
      // 進入 LIFF welcome
      router.push("/liff/welcome");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function clearPick() {
    localStorage.removeItem("devPersona");
    localStorage.removeItem("devPersonaName");
    setCurrentId(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A2342] to-[#0F1B2D] text-white">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="mb-6 text-center">
          <div className="text-3xl">🐠</div>
          <h1 className="mt-2 text-2xl font-bold">開發模式 · 身分切換</h1>
          <p className="mt-1 text-sm text-white/60">
            選一個身分進入網站，跳過 LINE 登入
          </p>
        </div>

        {currentId && (
          <div className="mb-4 rounded-lg border border-[#00D9CB]/40 bg-[#00D9CB]/10 p-3 text-center text-sm">
            目前：<span className="font-bold">{currentId}</span>
            <button
              onClick={clearPick}
              className="ml-3 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
            >
              清除
            </button>
          </div>
        )}

        {err && (
          <div className="mb-4 rounded-lg border border-[#FF7B5A] bg-[#FF7B5A]/10 p-3 text-sm">
            <div className="font-bold">載入失敗</div>
            <div className="mt-1 font-mono text-xs break-all">{err}</div>
            <div className="mt-2 text-xs text-white/60">
              請確認環境變數 NEXT_PUBLIC_LIFF_MOCK=1 或 NEXT_PUBLIC_DEV_MODE=1
              已設定，並重新啟動 dev server。
            </div>
          </div>
        )}

        {!personas && !err && (
          <div className="py-12 text-center text-sm text-white/60">載入中...</div>
        )}

        <div className="space-y-2">
          {personas?.map((p) => (
            <button
              key={p.lineUserId}
              onClick={() => pick(p)}
              disabled={busy !== null}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                currentId === p.lineUserId
                  ? "border-[#00D9CB] bg-[#00D9CB]/15"
                  : "border-white/15 bg-white/5 hover:border-[#00D9CB]/50 hover:bg-white/10"
              } ${busy ? "opacity-50" : ""}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">
                {p.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{p.displayName}</span>
                  <span className="text-xs text-white/50">({p.realName})</span>
                </div>
                <div className="mt-0.5 text-[11px] text-white/60">
                  {p.description}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {p.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded-full bg-[#00D9CB]/20 px-2 py-0.5 text-[10px] font-semibold text-[#00D9CB]"
                    >
                      {r}
                    </span>
                  ))}
                  {p.cert && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                      {p.cert}
                    </span>
                  )}
                </div>
              </div>
              {busy === p.lineUserId ? (
                <span className="text-xs text-white/60">登入中...</span>
              ) : (
                <span className="text-white/40">▸</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-lg bg-white/5 p-3 text-[11px] text-white/60">
          <div className="mb-1 font-semibold text-white/80">說明</div>
          <ul className="space-y-1 list-disc pl-4">
            <li>選一個身分後，所有 LIFF 頁面都會用這個 user 操作</li>
            <li>切換身分：再回到 /dev-login</li>
            <li>清除：點右上「清除」可回到未選狀態</li>
            <li>正式上 LINE：把環境變數 NEXT_PUBLIC_LIFF_MOCK 拿掉</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
