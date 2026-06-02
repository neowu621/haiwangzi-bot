# ship.ps1 — 一鍵發版：commit → push → Zeabur CLI 部署 → 輪詢驗證
#
# 用法（在專案根目錄）：
#   powershell -ExecutionPolicy Bypass -File scripts\ship.ps1 -Message "你的 commit 訊息"
#
# 這支腳本會：
#   1. git add -A + commit（用你給的訊息）
#   2. git push origin master
#   3. zeabur deploy（繞過 GitHub webhook，直接 CLI 部署本機 commit）
#   4. 每 20 秒輪詢 /api/healthz，比對 src/lib/version.ts 的 APP_VERSION
#   5. 版本相符 → ✓ 成功；超過 10 分鐘 → ✗ 提示去 dashboard 看
#
# 為什麼用 CLI deploy 而不靠 git push 自動觸發：
#   這個 repo 沒有 GitHub repo webhook（Zeabur 用 GitHub App 連），
#   過去多次發生「push 了但 Zeabur 沒自動 build」。CLI deploy 100% 會觸發。

param(
  [Parameter(Mandatory = $true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"
$SERVICE_ID = "6a022340dd502f86055afac5"
$PROJECT_ID = "6a01ded58e8e49b9247928c8"
$HEALTH_URL = "https://haiwangzi.zeabur.app/api/healthz"

# ── 讀取目標版本 ─────────────────────────────
$versionFile = Join-Path $PSScriptRoot "..\src\lib\version.ts"
$versionLine = Select-String -Path $versionFile -Pattern 'APP_VERSION\s*=\s*"([^"]+)"'
if (-not $versionLine) { Write-Host "✗ 找不到 APP_VERSION" -ForegroundColor Red; exit 1 }
$TARGET = $versionLine.Matches[0].Groups[1].Value
Write-Host "目標版本：$TARGET" -ForegroundColor Cyan

# ── 1. commit ────────────────────────────────
Write-Host "`n[1/4] git commit..." -ForegroundColor Yellow
git add -A
git commit -m $Message
if (-not $?) { Write-Host "（沒有變更要 commit，繼續）" -ForegroundColor DarkGray }

# ── 2. push ──────────────────────────────────
Write-Host "`n[2/4] git push..." -ForegroundColor Yellow
git push origin master

# ── 3. Zeabur CLI deploy ─────────────────────
Write-Host "`n[3/4] zeabur deploy（繞過 webhook）..." -ForegroundColor Yellow
zeabur deploy --service-id $SERVICE_ID --project-id $PROJECT_ID

# ── 4. 輪詢驗證 ──────────────────────────────
Write-Host "`n[4/4] 等待 $TARGET 上線（每 20 秒檢查，最多 10 分鐘）..." -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-RestMethod -Uri $HEALTH_URL -TimeoutSec 10
    if ($resp.version -eq $TARGET) {
      Write-Host "`n✓ $TARGET 已上線！" -ForegroundColor Green
      Write-Host ($resp | ConvertTo-Json -Compress) -ForegroundColor Green
      exit 0
    }
    Write-Host ("  目前線上：{0}（等 {1}）" -f $resp.version, $TARGET) -ForegroundColor DarkGray
  } catch {
    Write-Host "  健康檢查暫時無回應，重試中..." -ForegroundColor DarkGray
  }
  Start-Sleep -Seconds 20
}

Write-Host "`n✗ 10 分鐘內未見 $TARGET 上線。" -ForegroundColor Red
Write-Host "  build 可能還在跑，或 image pull 卡住。" -ForegroundColor Red
Write-Host "  到 https://zeabur.com/projects/$PROJECT_ID/services/$SERVICE_ID 看 Deployments 狀態。" -ForegroundColor Red
exit 1
