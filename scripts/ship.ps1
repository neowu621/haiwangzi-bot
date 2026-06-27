# ship.ps1 - one-shot release: commit -> push -> Zeabur CLI deploy -> poll verify
#
# Usage (from project root):
#   npm run ship "your commit message"
#   powershell -ExecutionPolicy Bypass -File scripts\ship.ps1 -Message "your commit message"
#
# Steps:
#   1. git add -A + commit (with your message)
#   2. git push origin master  (update remote HEAD)
#   3. zeabur service redeploy  (build the pushed HEAD from git; a plain push
#      does NOT reliably auto-build here)
#   4. poll /api/healthz every 20s, compare APP_VERSION in src/lib/version.ts
#      version match -> OK; over 10 min -> FAIL hint to check dashboard
#
# Why `service redeploy` and NOT `zeabur deploy` (CLI local-upload):
#   `zeabur deploy` uploads the local Windows working tree, which crashed prod
#   with "exec ./docker-entrypoint.sh: no such file or directory" AND raced the
#   git build, CANCELing it. `service redeploy` rebuilds the connected branch
#   HEAD from git (LF line endings) -- the reliable path on this repo.
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads UTF-8-without-BOM
#       files as the system codepage and will mangle non-ASCII characters,
#       causing a parser error. Do not put Chinese text in this script.

param(
  [Parameter(Mandatory = $true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"
$SERVICE_ID = "6a022340dd502f86055afac5"
$PROJECT_ID = "6a01ded58e8e49b9247928c8"
$ENV_ID = "6a01ded5e5ed304c1d846053"
$HEALTH_URL = "https://haiwangzi.xyz/api/healthz"

# -- read target version --
$versionFile = Join-Path $PSScriptRoot "..\src\lib\version.ts"
$versionLine = Select-String -Path $versionFile -Pattern 'APP_VERSION\s*=\s*"([^"]+)"'
if (-not $versionLine) { Write-Host "FAIL: APP_VERSION not found" -ForegroundColor Red; exit 1 }
$TARGET = $versionLine.Matches[0].Groups[1].Value
Write-Host "Target version: $TARGET" -ForegroundColor Cyan

# -- 1. commit --
Write-Host "`n[1/4] git commit..." -ForegroundColor Yellow
git add -A
git commit -m $Message
if (-not $?) { Write-Host "(nothing to commit, continuing)" -ForegroundColor DarkGray }

# -- 2. push (update remote master HEAD to this commit) --
Write-Host "`n[2/4] git push..." -ForegroundColor Yellow
git push origin master

# -- 3. trigger a GIT build of the pushed HEAD --
#   Use `zeabur service redeploy` (rebuilds the connected branch HEAD from git,
#   with proper LF line endings) -- NOT `zeabur deploy`, which uploads the local
#   Windows working tree and crashed prod with
#   "exec ./docker-entrypoint.sh: no such file or directory" while also racing
#   and CANCELing the git build. A plain push does NOT reliably auto-build here.
Write-Host "`n[3/4] zeabur service redeploy (git build of pushed HEAD)..." -ForegroundColor Yellow
zeabur service redeploy --id $SERVICE_ID --env-id $ENV_ID -y

# -- 4. poll verify --
Write-Host "`n[4/4] waiting for $TARGET to go live (check every 20s, max 10 min)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-RestMethod -Uri $HEALTH_URL -TimeoutSec 10
    if ($resp.version -eq $TARGET) {
      Write-Host "`nOK: $TARGET is LIVE" -ForegroundColor Green
      Write-Host ($resp | ConvertTo-Json -Compress) -ForegroundColor Green
      exit 0
    }
    Write-Host ("  live now: {0} (waiting for {1})" -f $resp.version, $TARGET) -ForegroundColor DarkGray
  } catch {
    Write-Host "  healthz not responding, retrying..." -ForegroundColor DarkGray
  }
  Start-Sleep -Seconds 20
}

Write-Host "`nFAIL: $TARGET not live within 10 min." -ForegroundColor Red
Write-Host "  build may still be running, or image pull is stuck." -ForegroundColor Red
Write-Host "  check: https://zeabur.com/projects/$PROJECT_ID/services/$SERVICE_ID" -ForegroundColor Red
exit 1
