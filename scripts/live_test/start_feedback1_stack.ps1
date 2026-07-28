param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$PdfPath = 'G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf'
)
$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot
if ($env:DRAWING_INTELLIGENCE_API_KEY) { throw 'Provider key must be absent during E2 real-stack/browser verification.' }
if (-not (Test-Path $PdfPath)) { throw "Authorized 53-page fixture missing: $PdfPath" }
$env:INTERNAL_SERVICE_KEY = if ($env:INTERNAL_SERVICE_KEY) { $env:INTERNAL_SERVICE_KEY } else { 'feedback1-local-key' }
$env:INTERNAL_SERVICE_SCOPES = 'dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate'
$env:PAAX_DB_SERVICE_URL = 'http://127.0.0.1:8001'
$env:DB_API_URL = 'http://127.0.0.1:8001'
$env:PAAX_CORE_ENGINE_URL = 'http://127.0.0.1:8081'
$env:CORE_ENGINE_URL = 'http://127.0.0.1:8081'
$env:PAAX_DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8083'
$env:DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8083'
$env:AI_ORCHESTRATOR_URL = 'http://127.0.0.1:8082'
$logs = Join-Path $RepoRoot '.local-test-logs\feedback1'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$processes = @()
$processes += Start-Process python -ArgumentList 'scripts/live_test/serve_db_with_fixture.py' -PassThru -RedirectStandardOutput "$logs\db.out.log" -RedirectStandardError "$logs\db.err.log"
$processes += Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/core-engine') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8081' -PassThru -RedirectStandardOutput "$logs\core.out.log" -RedirectStandardError "$logs\core.err.log"
$processes += Start-Process python -WorkingDirectory (Join-Path $RepoRoot 'services/document-intelligence') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8083' -PassThru -RedirectStandardOutput "$logs\di.out.log" -RedirectStandardError "$logs\di.err.log"
$processes += Start-Process node -WorkingDirectory (Join-Path $RepoRoot 'services/ai-orchestrator') -ArgumentList 'node_modules/typescript/bin/tsc','--noEmit' -Wait -PassThru -RedirectStandardOutput "$logs\orchestrator-typecheck.out.log" -RedirectStandardError "$logs\orchestrator-typecheck.err.log"
if ($processes[-1].ExitCode -ne 0) { throw 'AI Orchestrator typecheck failed; stack was not started.' }
$processes += Start-Process node -WorkingDirectory (Join-Path $RepoRoot 'services/ai-orchestrator') -ArgumentList 'node_modules/tsx/dist/cli.mjs','src/index.ts' -PassThru -RedirectStandardOutput "$logs\orchestrator.out.log" -RedirectStandardError "$logs\orchestrator.err.log"
$processes += Start-Process cmd.exe -WorkingDirectory (Join-Path $RepoRoot 'apps/web') -ArgumentList '/c','node node_modules/next/dist/bin/next dev --port 3000' -PassThru -RedirectStandardOutput "$logs\web.out.log" -RedirectStandardError "$logs\web.err.log"
$processes | Where-Object { -not $_.HasExited } | Select-Object Id,ProcessName | Format-Table
Write-Host 'Stack launch requested. Verify /health endpoints, upload/open the authorized fixture, then run feedback1-real-stack.spec.ts.'
Write-Host "Logs: $logs"
