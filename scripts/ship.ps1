# ship.ps1 - one-shot release: commit -> push -> Zeabur CLI deploy -> poll verify
#
# Usage (from project root):
#   npm run ship "your commit message"
#   powershell -ExecutionPolicy Bypass -File scripts\ship.ps1 -Message "your commit message"
#
# Steps:
#   1. git add -A + commit (with your message)
#   2. git push origin master  <- this is the deploy trigger (Zeabur GitHub App
#      auto-builds master from the repo, with proper LF line endings)
#   3. poll /api/healthz every 20s, compare APP_VERSION in src/lib/version.ts
#      version match -> OK; over 10 min -> FAIL hint to check dashboard
#
# Why NOT `zeabur deploy` (CLI local-upload):
#   It uploads the local Windows working tree, which crashed prod with
#   "exec ./docker-entrypoint.sh: no such file or directory" AND raced the
#   git-push build, CANCELing it. Always deploy via git push on this repo.
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

# -- 2. push (this is the deploy trigger: Zeabur GitHub App builds master) --
Write-Host "`n[2/3] git push (Zeabur GitHub App auto-builds master)..." -ForegroundColor Yellow
git push origin master

# NOTE: do NOT run `zeabur deploy` (CLI local-upload) here. It uploads the
# local Windows working tree and (a) crashed prod with
# "exec ./docker-entrypoint.sh: no such file or directory", and (b) raced the
# git-push build and CANCELED it. The git-push build is the reliable path.

# -- 3. poll verify --
Write-Host "`n[3/3] waiting for $TARGET to go live (check every 20s, max 10 min)..." -ForegroundColor Yellow
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
