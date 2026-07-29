param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)
$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot

$env:INTERNAL_SERVICE_KEY = 'live-test-key'
$env:INTERNAL_SERVICE_SCOPES = 'dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate'
$env:PAAX_PORTABLE_ACTOR_ID = 'paax-web'
$env:PAAX_DESKTOP_MODE = '1'
$env:NEXT_PUBLIC_USE_DB = 'true'

# Ports mapping per Phase 10B requirements
$env:CORE_ENGINE_URL = 'http://127.0.0.1:8000'
$env:NEXT_PUBLIC_CORE_ENGINE_URL = 'http://127.0.0.1:8000'
$env:DB_API_URL = 'http://127.0.0.1:8001'
$env:NEXT_PUBLIC_DB_API_URL = 'http://127.0.0.1:8001'
$env:DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8002'
$env:NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8002'

$dbPath = Join-Path $RepoRoot 'services/db/portable.sqlite'
$env:DATABASE_URL = "sqlite+aiosqlite:///$($dbPath.Replace('\', '/'))"

Write-Host "1. Seeding real PLHUT dataset into database..." -ForegroundColor Cyan
python scripts/live_test/seed_plhut_real.py

$logs = Join-Path $RepoRoot '.local-test-logs/feedback1'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

Write-Host "2. Launching 4 real stack services..." -ForegroundColor Cyan
$pids = @{}

# Core Engine (Port 8000)
$procCore = Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/core-engine') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -PassThru -RedirectStandardOutput "$logs/core.out.log" -RedirectStandardError "$logs/core.err.log"
$pids['core_engine'] = $procCore.Id

# DB API (Port 8001)
$procDb = Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/db/src') -ArgumentList '-m','uvicorn','paax_db.main:app','--host','127.0.0.1','--port','8001' -PassThru -RedirectStandardOutput "$logs/db.out.log" -RedirectStandardError "$logs/db.err.log"
$pids['db_api'] = $procDb.Id

# Document Intelligence (Port 8002)
$procDi = Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/document-intelligence') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8002' -PassThru -RedirectStandardOutput "$logs/di.out.log" -RedirectStandardError "$logs/di.err.log"
$pids['doc_intel'] = $procDi.Id

# Web App (Port 3000)
$procWeb = Start-Process cmd.exe -WorkingDirectory (Join-Path $RepoRoot 'apps/web') -ArgumentList '/c','npx next dev --port 3000' -PassThru -RedirectStandardOutput "$logs/web.out.log" -RedirectStandardError "$logs/web.err.log"
$pids['web_app'] = $procWeb.Id

# Save task-local process IDs
$pidReport = Join-Path $logs 'pids.json'
$pids | ConvertTo-Json | Set-Content -Path $pidReport
Write-Host "Process IDs saved to $pidReport" -ForegroundColor Yellow

# 3. Perform Fail-Closed Health Check & Data Verification
Write-Host "3. Verifying real-stack service health endpoints..." -ForegroundColor Cyan
$endpoints = @(
  "http://127.0.0.1:8000/health",
  "http://127.0.0.1:8001/health",
  "http://127.0.0.1:8002/health",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3000/api/db-projects/projects"
)

$maxAttempts = 30
foreach ($ep in $endpoints) {
  $ready = $false
  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $ep -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($resp.StatusCode -eq 200) {
        $ready = $true
        Write-Host "  [OK] $ep" -ForegroundColor Green
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $ready) {
    Write-Error "Fail-closed check: Service endpoint failed to respond HTTP 200: $ep"
    exit 1
  }
}

Write-Host "`n=== Phase 10B Real 4-Service Stack Ready and Operational ===" -ForegroundColor Green
