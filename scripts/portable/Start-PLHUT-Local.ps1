[CmdletBinding()] param([switch]$SkipOptionalServices, [string]$DataRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { throw "Jalankan Setup-PLHUT-Local.ps1 terlebih dahulu." }

. (Join-Path $repoRoot "scripts\portable\Resolve-PAAX-DataRoot.ps1")
$resolvedRoot = Resolve-PaaxDataRoot -DataRoot $DataRoot -InstallRoot $repoRoot
$layout = Ensure-PaaxDataRootLayout -Root $resolvedRoot

$runtimeDir = $layout.runtime

# Git identity resolution
$gitCommit = "unknown"
$gitBranch = "unknown"
$gitDirty = "false"
try {
    $c = (git -C $repoRoot rev-parse HEAD 2>$null)
    if ($c) { $gitCommit = $c.Trim() }
    $b = (git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
    if ($b) { $gitBranch = $b.Trim() }
    $d = (git -C $repoRoot status --porcelain 2>$null)
    if ($d) { $gitDirty = "true" }
} catch {}

# One runtime identity shared by DB proxies, Command Room, and workers.
$keyFile = Join-Path $runtimeDir "internal-service.key"
if (-not (Test-Path $keyFile)) { [IO.File]::WriteAllText($keyFile, ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))) }

$env:PYTHONUTF8="1"
$env:PAAX_REPO_ROOT=$repoRoot
$env:PAAX_COMMIT=$gitCommit
$env:PAAX_BRANCH=$gitBranch
$env:PAAX_DIRTY=$gitDirty
$env:PAAX_PORTABLE_ACTOR_ID="paax-web"
$env:PAAX_DATA_ROOT=$resolvedRoot
$env:PAAX_PORTABLE_DATA_DIR=$resolvedRoot

$env:INTERNAL_SERVICE_KEY=(Get-Content $keyFile -Raw).Trim()
$env:INTERNAL_SERVICE_SCOPES="dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor"
$env:DB_API_URL="http://127.0.0.1:8001"; $env:NEXT_PUBLIC_DB_API_URL=$env:DB_API_URL; $env:NEXT_PUBLIC_USE_DB="true"
$env:CORE_ENGINE_URL="http://127.0.0.1:8081"; $env:NEXT_PUBLIC_CORE_ENGINE_URL=$env:CORE_ENGINE_URL
$env:DOCUMENT_INTELLIGENCE_URL="http://127.0.0.1:8083"; $env:NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL=$env:DOCUMENT_INTELLIGENCE_URL
$env:AI_ORCHESTRATOR_URL="http://127.0.0.1:8082"

$env:PAAX_AGENT_RUN_STORE=(Join-Path $layout.jobs "agent-runs.json")
$env:PAAX_AGENT_EVENT_JOURNAL=(Join-Path $layout.jobs "agent-events.jsonl")
$env:PAAX_AGENT_DEAD_LETTER=(Join-Path $layout.jobs "agent-dead-letter.jsonl")
$env:PAAX_TAKEOFF_STORE=(Join-Path $layout.jobs "takeoff-workspace.json")
$env:PAAX_ENTITY_LINK_STORE=(Join-Path $layout.jobs "entity-links.json")

& $venvPython (Join-Path $repoRoot "scripts\portable\preflight.py") --allow-running

function Verify-PortOwnership([int]$Port, [string]$ServiceName) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            $owningPid = $conn.OwningProcess
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
            $cmdLine = if ($proc) { $proc.CommandLine } else { "" }
            if ($cmdLine -and -not $cmdLine.Contains($repoRoot)) {
                throw "Port $Port ($ServiceName) sedang digunakan oleh proses dari repository lain (PID $owningPid): $cmdLine. Hentikan service lama sebelum menjalankan contextual integration."
            }
        }
    }
}

function Start-ServiceProcess([string]$Name,[string]$FilePath,[string[]]$Arguments,[string]$WorkingDirectory,[int]$Port) {
    $pidFile=Join-Path $runtimeDir "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPidStr = Get-Content $pidFile -Raw -ErrorAction SilentlyContinue
        if ($oldPidStr) {
            $oldPid = [int]$oldPidStr.Trim()
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $oldPid" -ErrorAction SilentlyContinue
            if ($proc) {
                $cmdLine = $proc.CommandLine
                if ($cmdLine -and $cmdLine.Contains($repoRoot)) {
                    Write-Host "$Name already running (PID $oldPid) from this repository"
                    return
                } else {
                    throw "PID file $Name.pid menunjuk ke PID $oldPid dari repository lain ($cmdLine). Hentikan server lama terlebih dahulu."
                }
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    Verify-PortOwnership -Port $Port -ServiceName $Name

    $outLog = Join-Path $runtimeDir "$Name.out.log"
    $errLog = Join-Path $runtimeDir "$Name.err.log"
    $cmdLine = "cmd.exe /c `"`"$FilePath`" " + ($Arguments -join " ") + " > `"$outLog`" 2> `"$errLog`"`""

    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $cmdLine
        CurrentDirectory = $WorkingDirectory
    }

    if ($result.ReturnValue -ne 0) {
        throw "Gagal menjalankan service $Name. WMI ReturnValue: $($result.ReturnValue)"
    }

    Set-Content $pidFile $result.ProcessId
    Write-Host "Started $Name (PID $($result.ProcessId))"
}

function Wait-Health([string]$Name,[string]$Url,[int]$Seconds=90) {
    $deadline=(Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3 -ErrorAction Stop
            if ($r.status -eq "ok") {
                $serviceRepo = $r.runtime_identity.repo_root
                if ($serviceRepo -and (Resolve-Path $serviceRepo).Path -ne (Resolve-Path $repoRoot).Path) {
                    throw "Service $Name di $Url melaporkan repo_root '$serviceRepo', tidak cocok dengan '$repoRoot'."
                }
                Write-Host "READY $Name - $Url (Commit: $($r.runtime_identity.commit))"
                return
            }
        } catch {
            if ($_.Exception.Message -like "*tidak cocok*") { throw $_ }
        }
        Start-Sleep -Milliseconds 700
    }
    throw "$Name tidak sehat setelah $Seconds detik. Periksa $($runtimeDir)\$Name.err.log"
}

Start-ServiceProcess "db-plhut" $venvPython @("scripts/live_test/serve_db_with_fixture.py") $repoRoot 8001
Wait-Health "db-plhut" "http://127.0.0.1:8001/health"

Start-ServiceProcess "core-engine" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8081") (Join-Path $repoRoot "services\core-engine") 8081
Wait-Health "core-engine" "http://127.0.0.1:8081/health"

Start-ServiceProcess "document-intelligence" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8083") (Join-Path $repoRoot "services\document-intelligence") 8083
Wait-Health "document-intelligence" "http://127.0.0.1:8083/health"

if (-not $SkipOptionalServices) {
    Start-ServiceProcess "ai-orchestrator" "pnpm.cmd" @("--dir","services/ai-orchestrator","dev") $repoRoot 8082
    Wait-Health "ai-orchestrator" "http://127.0.0.1:8082/health" 120

    Start-ServiceProcess "site-agent" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8085") (Join-Path $repoRoot "services\site-agent") 8085
    Wait-Health "site-agent" "http://127.0.0.1:8085/health" 90
}

Start-ServiceProcess "web" "pnpm.cmd" @("--dir","apps/web","dev","--hostname","127.0.0.1","--port","3000") $repoRoot 3000
Wait-Health "web" "http://127.0.0.1:3000/api/health" 180

function Get-PidSafe([string]$Path) {
    if (Test-Path $Path) {
        $val = Get-Content $Path -Raw -ErrorAction SilentlyContinue
        if ($val) { return $val.Trim() }
    }
    return ""
}

# Write atomic runtime manifest
$manifestData = [ordered]@{
    created_at = (Get-Date -Format "o")
    repo_root = $repoRoot
    commit = $gitCommit
    branch = $gitBranch
    dirty = $gitDirty
    data_root = $resolvedRoot
    services = [ordered]@{
        "db-plhut" = @{ port = 8001; pid = (Get-PidSafe (Join-Path $runtimeDir "db-plhut.pid")) }
        "core-engine" = @{ port = 8081; pid = (Get-PidSafe (Join-Path $runtimeDir "core-engine.pid")) }
        "document-intelligence" = @{ port = 8083; pid = (Get-PidSafe (Join-Path $runtimeDir "document-intelligence.pid")) }
        "ai-orchestrator" = if (-not $SkipOptionalServices) { @{ port = 8082; pid = (Get-PidSafe (Join-Path $runtimeDir "ai-orchestrator.pid")) } } else { $null }
        "site-agent" = if (-not $SkipOptionalServices) { @{ port = 8085; pid = (Get-PidSafe (Join-Path $runtimeDir "site-agent.pid")) } } else { $null }
        "web" = @{ port = 3000; pid = (Get-PidSafe (Join-Path $runtimeDir "web.pid")) }
    }
}
$manifestJson = ConvertTo-Json $manifestData -Depth 5
[IO.File]::WriteAllText((Join-Path $runtimeDir "runtime-manifest.json"), $manifestJson)

Write-Host "PAAX siap: http://127.0.0.1:3000 - Data Root: $resolvedRoot"
