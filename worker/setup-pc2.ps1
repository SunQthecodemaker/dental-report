#requires -Version 5.1
<#
.SYNOPSIS
  dental-report worker — PC2 자동 세팅 스크립트

.DESCRIPTION
  더블클릭 한 번으로 PC2 워커 가동까지.
  자동: git pull / npm install / .env 생성 / pm2 등록·재시작
  수동 (스크립트가 안내): claude setup-token (1회) / pm2 startup (관리자 권한)

.NOTES
  같은 스크립트 여러 번 실행해도 안전 (idempotent).
  기존 워커 가동 중이면 재시작만.
#>

$ErrorActionPreference = 'Stop'
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir   = Split-Path -Parent $WorkerDir
Set-Location $WorkerDir

function Write-Step($msg)    { Write-Host "▶ $msg" -ForegroundColor Cyan }
function Write-OK($msg)      { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg)     { Write-Host "  ❌ $msg" -ForegroundColor Red }

Write-Host ''
Write-Host '═══════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '   dental-report worker — PC2 자동 세팅'           -ForegroundColor Cyan
Write-Host "   $env:COMPUTERNAME  /  $($env:USERNAME)"
Write-Host '═══════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# ───────────────────────────────────────────────
# 1. Node.js ≥ 20 체크
# ───────────────────────────────────────────────
Write-Step 'Node.js 확인'
try {
  $nodeVer = (node --version 2>$null) -replace '^v',''
  $major = [int]($nodeVer.Split('.')[0])
  if ($major -lt 20) { throw "Node $nodeVer (20+ 필요)" }
  Write-OK "Node $nodeVer"
} catch {
  Write-Err 'Node.js 20 이상이 필요합니다.'
  Write-Host '   → https://nodejs.org 에서 LTS 설치 후 다시 실행' -ForegroundColor Yellow
  exit 1
}

# ───────────────────────────────────────────────
# 2. git pull (worker 최신 코드 가져오기)
# ───────────────────────────────────────────────
Write-Step 'git pull'
Push-Location $RepoDir
try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch) {
    git fetch --quiet
    $localHead  = (git rev-parse HEAD).Trim()
    $remoteHead = (git rev-parse "origin/$branch" 2>$null).Trim()
    if ($localHead -ne $remoteHead) {
      git pull --ff-only
      Write-OK "$branch 업데이트됨"
    } else {
      Write-OK "$branch 최신 상태"
    }
  } else {
    Write-Warn 'git 저장소 아님 — pull 건너뜀'
  }
} catch {
  Write-Warn "git pull 실패: $($_.Exception.Message) — 계속 진행"
} finally {
  Pop-Location
}

# ───────────────────────────────────────────────
# 3. pm2 글로벌 설치 (없으면)
# ───────────────────────────────────────────────
Write-Step 'pm2 확인'
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
  Write-Host '  📦 pm2 글로벌 설치 중…'
  npm install -g pm2 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Err 'pm2 설치 실패'; exit 1 }
}
Write-OK 'pm2'

# ───────────────────────────────────────────────
# 4. npm 의존성 설치
# ───────────────────────────────────────────────
Write-Step 'npm install'
if (-not (Test-Path 'node_modules')) {
  npm install
  if ($LASTEXITCODE -ne 0) { Write-Err 'npm install 실패'; exit 1 }
} else {
  Write-OK 'node_modules 이미 있음 (재설치 건너뜀)'
}
Write-OK 'npm 의존성'

# ───────────────────────────────────────────────
# 5. Claude Code OAuth 토큰 확인
# ───────────────────────────────────────────────
Write-Step 'Claude Code OAuth 토큰 확인'
$credPath = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (-not (Test-Path $credPath)) {
  Write-Err 'OAuth 토큰 없음'
  Write-Host ''
  Write-Host '   👉 새 터미널 창에서 한 번만 실행 후 이 스크립트 다시 실행:' -ForegroundColor Yellow
  Write-Host '      claude setup-token' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '   (브라우저가 열리고 Claude Max 계정 로그인 → 토큰 자동 저장)' -ForegroundColor DarkGray
  exit 1
}
Write-OK "OAuth 토큰 존재 ($credPath)"

# ───────────────────────────────────────────────
# 6. .env 생성 (없으면 secrets 헬퍼로 값 가져오기)
# ───────────────────────────────────────────────
Write-Step '.env 확인'
$envPath = Join-Path $WorkerDir '.env'
if (-not (Test-Path $envPath)) {
  Write-Host '  🔐 .env 신규 생성 — Z:/web/.claude-setup/credentials 에서 값 로드'
  $secretHelper = 'Z:\web\.claude-setup\credentials\get-secret.ps1'
  if (-not (Test-Path $secretHelper)) {
    Write-Err 'secrets 헬퍼 못 찾음 — NAS (Z:) 마운트 확인'
    Write-Host '   수동으로 .env 파일을 작성하시려면 .env.example 참고하세요' -ForegroundColor Yellow
    exit 1
  }

  function Get-Secret($key) {
    $val = & $secretHelper $key 2>$null
    if (-not $val) { return $null }
    return $val.Trim()
  }

  $supabaseUrl  = Get-Secret 'supabase.projects.offapp.url'
  $serviceKey   = Get-Secret 'supabase.projects.offapp.service_role_key'

  if (-not $supabaseUrl -or -not $serviceKey) {
    Write-Err 'secrets 헬퍼에서 값을 못 받았습니다.'
    Write-Host '   다음 키가 존재해야 합니다:' -ForegroundColor Yellow
    Write-Host '     supabase.projects.offapp.url'
    Write-Host '     supabase.projects.offapp.service_role_key'
    Write-Host '   확인:  Z:\web\.claude-setup\credentials\get-secret.cmd supabase.projects.offapp.url'
    exit 1
  }

  $envContent = @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$serviceKey
WORKER_ID=pc-$env:COMPUTERNAME
COMPOSE_MODEL=claude-sonnet-4-6
ANALYZE_MODEL=claude-sonnet-4-6
"@
  # BOM 없는 UTF-8 (dotenv 호환)
  [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))
  Write-OK '.env 생성됨'
} else {
  Write-OK '.env 이미 있음 (재생성 안 함)'
}

# ───────────────────────────────────────────────
# 7. pm2 로 워커 가동·재시작
# ───────────────────────────────────────────────
Write-Step 'pm2 워커 가동'
$existing = $null
try {
  $jlist = pm2 jlist 2>$null | ConvertFrom-Json
  if ($jlist) {
    $existing = $jlist | Where-Object { $_.name -eq 'dental-worker' }
  }
} catch { $existing = $null }

if ($existing) {
  pm2 restart dental-worker --update-env | Out-Null
  Write-OK 'dental-worker 재시작'
} else {
  pm2 start index.js --name dental-worker --time | Out-Null
  Write-OK 'dental-worker 시작'
}
pm2 save | Out-Null

# 잠시 대기 후 상태 확인
Start-Sleep -Seconds 2
Write-Host ''
pm2 status

# ───────────────────────────────────────────────
# 8. 마무리 안내
# ───────────────────────────────────────────────
Write-Host ''
Write-Host '═══════════════════════════════════════════════' -ForegroundColor Green
Write-Host '   ✅ 세팅 완료 — 워커 가동 중'                  -ForegroundColor Green
Write-Host '═══════════════════════════════════════════════' -ForegroundColor Green
Write-Host ''
Write-Host '확인 명령:'
Write-Host '  pm2 status                 # 상태'
Write-Host '  pm2 logs dental-worker     # 실시간 로그'
Write-Host '  pm2 restart dental-worker  # 재시작'
Write-Host ''
Write-Host '⚠️  부팅 시 자동 시작 (선택, 1회만)' -ForegroundColor Yellow
Write-Host '   관리자 권한 PowerShell 에서:'
Write-Host '     cd ' -NoNewline; Write-Host $WorkerDir -ForegroundColor Cyan
Write-Host '     pm2 startup' -ForegroundColor Cyan
Write-Host '   → 출력되는 명령 한 줄을 그 창에서 실행 → 끝'
Write-Host ''
