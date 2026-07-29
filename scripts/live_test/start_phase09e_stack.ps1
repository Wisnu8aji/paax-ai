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

# Ports mapping per Phase 09E Correction Round 1 requirements
$env:CORE_ENGINE_URL = 'http://127.0.0.1:8000'
$env:NEXT_PUBLIC_CORE_ENGINE_URL = 'http://127.0.0.1:8000'
$env:DB_API_URL = 'http://127.0.0.1:8001'
$env:NEXT_PUBLIC_DB_API_URL = 'http://127.0.0.1:8001'
$env:DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8002'
$env:NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8002'

$dbPath = Join-Path $RepoRoot 'services/db/portable.sqlite'
$env:DATABASE_URL = "sqlite+aiosqlite:///$($dbPath.Replace('\', '/'))"

Write-Host "1. Seeding database with real PLHUT dataset..."
python scripts/live_test/seed_plhut_real.py

$logs = Join-Path $RepoRoot '.local-test-logs/phase09e'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

Write-Host "2. Launching real stack services on ports 8000, 8001, 8002, 3000..."
$processes = [System.Collections.ArrayList]::new()

# Core Engine (Port 8000)
$null = $processes.Add((Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/core-engine') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -PassThru -RedirectStandardOutput "$logs/core.out.log" -RedirectStandardError "$logs/core.err.log"))

# DB API (Port 8001)
$null = $processes.Add((Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/db/src') -ArgumentList '-m','uvicorn','paax_db.main:app','--host','127.0.0.1','--port','8001' -PassThru -RedirectStandardOutput "$logs/db.out.log" -RedirectStandardError "$logs/db.err.log"))

# Document Intelligence (Port 8002)
$null = $processes.Add((Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/document-intelligence') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8002' -PassThru -RedirectStandardOutput "$logs/di.out.log" -RedirectStandardError "$logs/di.err.log"))

# Web App (Port 3000)
$null = $processes.Add((Start-Process cmd.exe -WorkingDirectory (Join-Path $RepoRoot 'apps/web') -ArgumentList '/c','npx next dev --port 3000' -PassThru -RedirectStandardOutput "$logs/web.out.log" -RedirectStandardError "$logs/web.err.log"))

Write-Host "Stack launched with Process IDs:"
$processes | Select-Object Id, ProcessName | Format-Table

Write-Host "Logs directed to: $logs"
