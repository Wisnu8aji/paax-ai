[CmdletBinding()] param([switch]$SkipOptionalServices)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { throw "Jalankan Setup-PLHUT-Local.ps1 terlebih dahulu." }
$runtimeDir = Join-Path $repoRoot ".local-runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

# One runtime identity shared by DB proxies, Command Room, and workers.
$keyFile = Join-Path $runtimeDir "internal-service.key"
if (-not (Test-Path $keyFile)) { [IO.File]::WriteAllText($keyFile, ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))) }
$env:PYTHONUTF8="1"
$env:PAAX_REPO_ROOT=$repoRoot
$env:PAAX_PORTABLE_ACTOR_ID="paax-web"
$env:PAAX_PORTABLE_DATA_DIR=(Join-Path $repoRoot "data\portable")
$env:INTERNAL_SERVICE_KEY=(Get-Content $keyFile -Raw).Trim()
$env:INTERNAL_SERVICE_SCOPES="dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor"
$env:DB_API_URL="http://127.0.0.1:8001"; $env:NEXT_PUBLIC_DB_API_URL=$env:DB_API_URL; $env:NEXT_PUBLIC_USE_DB="true"
$env:CORE_ENGINE_URL="http://127.0.0.1:8081"; $env:NEXT_PUBLIC_CORE_ENGINE_URL=$env:CORE_ENGINE_URL
$env:DOCUMENT_INTELLIGENCE_URL="http://127.0.0.1:8083"; $env:NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL=$env:DOCUMENT_INTELLIGENCE_URL
$env:AI_ORCHESTRATOR_URL="http://127.0.0.1:8082"
$env:PAAX_AGENT_RUN_STORE=(Join-Path $repoRoot "data\portable\agent-runs.json")
$env:PAAX_AGENT_EVENT_JOURNAL=(Join-Path $repoRoot "data\portable\agent-events.jsonl")
$env:PAAX_AGENT_DEAD_LETTER=(Join-Path $repoRoot "data\portable\agent-dead-letter.jsonl")
$env:PAAX_TAKEOFF_STORE=(Join-Path $repoRoot "data\portable\takeoff-workspace.json")
$env:PAAX_ENTITY_LINK_STORE=(Join-Path $repoRoot "data\portable\entity-links.json")

& $venvPython (Join-Path $repoRoot "scripts\portable\preflight.py") --allow-running

function Start-ServiceProcess([string]$Name,[string]$FilePath,[string[]]$Arguments,[string]$WorkingDirectory) {
    $pidFile=Join-Path $runtimeDir "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPid=[int](Get-Content $pidFile -Raw)
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { Write-Host "$Name already running (PID $oldPid)"; return }
    }
    $process=Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeDir "$Name.out.log") -RedirectStandardError (Join-Path $runtimeDir "$Name.err.log")
    Set-Content $pidFile $process.Id
    Write-Host "Started $Name (PID $($process.Id))"
}
function Wait-Health([string]$Name,[string]$Url,[int]$Seconds=90) {
    $deadline=(Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try { $r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -lt 500) { Write-Host "READY $Name — $Url"; return } } catch {}
        Start-Sleep -Milliseconds 700
    }
    throw "$Name tidak sehat setelah $Seconds detik. Periksa .local-runtime\$Name.err.log"
}

Start-ServiceProcess "db-plhut" $venvPython @("scripts/live_test/serve_db_with_fixture.py") $repoRoot
Wait-Health "db-plhut" "http://127.0.0.1:8001/health"
Start-ServiceProcess "core-engine" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8081") (Join-Path $repoRoot "services\core-engine")
Wait-Health "core-engine" "http://127.0.0.1:8081/health"
Start-ServiceProcess "document-intelligence" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8083") (Join-Path $repoRoot "services\document-intelligence")
Wait-Health "document-intelligence" "http://127.0.0.1:8083/health"
if (-not $SkipOptionalServices) {
    Start-ServiceProcess "ai-orchestrator" "pnpm.cmd" @("--dir","services/ai-orchestrator","dev") $repoRoot
    Wait-Health "ai-orchestrator" "http://127.0.0.1:8082/health" 120
    Start-ServiceProcess "site-agent" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8085") (Join-Path $repoRoot "services\site-agent")
}
Start-ServiceProcess "web" "pnpm.cmd" @("--dir","apps/web","dev","--hostname","127.0.0.1","--port","3000") $repoRoot
Wait-Health "web" "http://127.0.0.1:3000" 180
Write-Host "PAAX siap: http://127.0.0.1:3000 — PLHUT-SURAKARTA terdaftar secara persisten."
