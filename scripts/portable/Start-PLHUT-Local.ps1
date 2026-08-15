[CmdletBinding()] param([switch]$SkipOptionalServices, [string]$DataRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { throw "Jalankan Setup-PLHUT-Local.ps1 terlebih dahulu." }
$packageManager = ((Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json).packageManager)
if ([string]::IsNullOrWhiteSpace($packageManager) -or $packageManager -notmatch '^pnpm@\d+\.\d+\.\d+$') {
    throw "packageManager pnpm yang dipatok tidak ditemukan di package.json; startup dihentikan."
}

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

function Set-UserOnlyFileAcl([string]$Path) {
    # Runtime credentials are local user secrets.  Re-verify on every restart:
    # any ACL uncertainty is a fail-closed startup failure.
    try {
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $Path /inheritance:r /grant:r "$currentUser`:(F)" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "icacls failed with exit code $LASTEXITCODE" }
        $acl = Get-Acl -LiteralPath $Path
        $mine = @($acl.Access | Where-Object {
            $_.IdentityReference.Value -eq $currentUser -and
            $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            -not $_.IsInherited -and
            (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl)
        })
        if ($acl.Owner -ne $currentUser -or $mine.Count -ne 1 -or @($acl.Access).Count -ne 1) {
            throw "ACL is not user-only after enforcement"
        }
    } catch {
        throw "Tidak dapat menerapkan ACL user-only pada runtime credential. Startup dihentikan: $($_.Exception.Message)"
    }
}

function Get-CredentialSha256([string]$Value) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))) -replace '-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

$credentialDir = Join-Path $runtimeDir "service-credentials"
New-Item -ItemType Directory -Force -Path $credentialDir | Out-Null
$serviceIdentities = [ordered]@{
    "db-plhut" = @{ identity = "db-plhut"; scopes = @() }
    "core-engine" = @{ identity = "core-engine"; scopes = @() }
    "document-intelligence" = @{ identity = "document-intelligence"; scopes = @("dem:read", "dem:write", "dem:delete", "dem:authorize-actor", "project_graph:synthesize", "di:access", "core:access") }
    "ai-orchestrator" = @{ identity = "ai-orchestrator"; scopes = @("agent:propose", "agent:calculate", "agent:read", "core:access", "di:access") }
    "site-agent" = @{ identity = "site-agent"; scopes = @("site:access", "core:access") }
    "web" = @{ identity = "web-user-proxy"; actor_id = "local-desktop-user"; scopes = @("human:approve", "core:access", "di:access", "agent:access", "site:access", "dem:read") }
}
$serviceEnvironment = @{}
$registryIdentities = @()
foreach ($serviceName in $serviceIdentities.Keys) {
    $credentialPath = Join-Path $credentialDir "$serviceName.key"
    if (-not (Test-Path $credentialPath)) {
        [IO.File]::WriteAllText($credentialPath, ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")))
    }
    Set-UserOnlyFileAcl -Path $credentialPath
    $credential = (Get-Content -LiteralPath $credentialPath -Raw).Trim()
    if ($credential.Length -lt 32) { throw "Runtime credential untuk $serviceName tidak valid; startup dihentikan." }
    $definition = $serviceIdentities[$serviceName]
    $registryEntry = [ordered]@{
        identity = $definition.identity
        credential_sha256 = Get-CredentialSha256 -Value $credential
        scopes = @($definition.scopes)
    }
    if ($definition.ContainsKey("actor_id")) { $registryEntry.actor_id = $definition.actor_id }
    $registryIdentities += $registryEntry
    # Raw credential enters only this in-memory per-child environment object.
    $serviceEnvironment[$serviceName] = @{ INTERNAL_SERVICE_KEY = $credential }
}

$artifactSigningKeyPath = Join-Path $credentialDir "artifact-signing.key"
if (-not (Test-Path $artifactSigningKeyPath)) {
    [IO.File]::WriteAllText($artifactSigningKeyPath, ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")))
}
Set-UserOnlyFileAcl -Path $artifactSigningKeyPath
$artifactSigningSecret = (Get-Content -LiteralPath $artifactSigningKeyPath -Raw).Trim()
if ($artifactSigningSecret.Length -lt 32) { throw "Runtime artifact signing secret tidak valid; startup dihentikan." }
$serviceEnvironment["document-intelligence"]["ARTIFACT_SIGNING_SECRET"] = $artifactSigningSecret
# P0 FIX: point document-intelligence (API + worker) at the DB-backed durable
# queue so that dem.extract enqueues land in services/db (durable_jobs table)
# instead of the per-process in-memory store that has no consumer in the
# portable stack.  DB_API_URL must point to the local db service (port 8001),
# not the production default (localhost:8084) which is unreachable here.
$serviceEnvironment["document-intelligence"]["JOB_QUEUE_BACKEND"] = "durable-db"
$serviceEnvironment["document-intelligence"]["DB_API_URL"] = "http://127.0.0.1:8001"

$serviceIdentityRegistry = Join-Path $runtimeDir "service-identities.json"
$registry = [ordered]@{ version = 1; identities = $registryIdentities }
[IO.File]::WriteAllText($serviceIdentityRegistry, (ConvertTo-Json $registry -Depth 5))
Set-UserOnlyFileAcl -Path $serviceIdentityRegistry

$env:PYTHONUTF8="1"
$env:PAAX_REPO_ROOT=$repoRoot
$env:PAAX_COMMIT=$gitCommit
$env:PAAX_BRANCH=$gitBranch
$env:PAAX_DIRTY=$gitDirty
$env:PAAX_DATA_ROOT=$resolvedRoot
$env:PAAX_PORTABLE_DATA_DIR=$resolvedRoot
$env:PAAX_SERVICE_IDENTITY_REGISTRY=$serviceIdentityRegistry
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

function Test-TrustedHealthIdentity([int]$Port, [string]$ServiceName) {
    # Windows can expose a uvicorn worker's socket PID while hiding the parent
    # process from the current PowerShell session. If command-line ownership
    # is unavailable, trust only a live health response that proves both the
    # exact repository root and the expected service name.
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
        return $health.status -eq "ok" -and
            $health.service -eq $ServiceName -and
            $health.runtime_identity.repo_root -and
            (Resolve-Path $health.runtime_identity.repo_root).Path -eq (Resolve-Path $repoRoot).Path
    } catch {
        return $false
    }
}

function Verify-PortOwnership([int]$Port, [string]$ServiceName) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            $owningPid = $conn.OwningProcess
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
            $cmdLine = if ($proc) { $proc.CommandLine } else { "" }
            if (-not $cmdLine) {
                if (Test-TrustedHealthIdentity -Port $Port -ServiceName $ServiceName) {
                    continue
                }
                throw "Port $Port ($ServiceName) ownership tidak dapat diverifikasi; health identity tidak cocok."
            }
            if ($cmdLine -and -not $cmdLine.Contains($repoRoot)) {
                throw "Port $Port ($ServiceName) sedang digunakan oleh proses dari repository lain (PID $owningPid): $cmdLine. Hentikan service lama sebelum menjalankan contextual integration."
            }
            # A same-repo listener here is a stale orphan: this function only
            # runs after the pid-file check above confirmed the recorded instance
            # is dead (or no pid file exists). On Windows the venv python.exe is
            # a redirector shim whose real interpreter is a CHILD process, and
            # uvicorn --workers adds more children; a previous Stop that killed
            # only the recorded PID leaves the child holding the socket. Kill it
            # so the fresh instance can bind instead of silently colliding.
            if ($cmdLine -and $cmdLine.Contains($repoRoot)) {
                Write-Host "Stopping stale $ServiceName instance from previous run on port $Port (PID $owningPid)..."
                Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
            }
        }
    }
}

function Test-ListenerOwnership([int]$Port, [string]$ServiceName) {
    # A .cmd/Corepack launcher remains the PID written to the runtime file,
    # while its Node child owns the TCP listener. For a live service, inspect
    # the listener process itself rather than rejecting the command wrapper.
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) { return $false }
    foreach ($listener in $listeners) {
        $listenerPid = $listener.OwningProcess
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid" -ErrorAction SilentlyContinue
        $listenerCmdLine = if ($listenerProcess) { $listenerProcess.CommandLine } else { "" }
        if (-not $listenerCmdLine) {
            if (Test-TrustedHealthIdentity -Port $Port -ServiceName $ServiceName) {
                continue
            }
            throw "Port $Port ($ServiceName) ownership tidak dapat diverifikasi; health identity tidak cocok."
        }
        if (-not ($listenerCmdLine -and $listenerCmdLine.Contains($repoRoot))) {
            throw "Port $Port ($ServiceName) sedang digunakan oleh proses dari repository lain (PID $listenerPid): $listenerCmdLine. Hentikan service lama sebelum menjalankan contextual integration."
        }
    }
    return $true
}

function Set-ProcessLaunchCommand([System.Diagnostics.ProcessStartInfo]$Psi,[string]$FilePath,[string[]]$Arguments) {
    # ProcessStartInfo with UseShellExecute=false cannot invoke a .cmd/.bat
    # shim directly on Windows. Route those shims through cmd.exe using the
    # .Arguments API that is available on every supported PowerShell host.
    $extension = [IO.Path]::GetExtension($FilePath)
    $isCommandShim = $extension -and (
        $extension.Equals(".cmd", [System.StringComparison]::OrdinalIgnoreCase) -or
        $extension.Equals(".bat", [System.StringComparison]::OrdinalIgnoreCase)
    )
    $serializedArguments = ($Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\\"') + '"' } else { $_ }
    }) -join ' '
    if ($isCommandShim) {
        if ([string]::IsNullOrWhiteSpace($env:ComSpec) -or -not (Test-Path -LiteralPath $env:ComSpec)) {
            throw "cmd.exe tidak tersedia untuk menjalankan shim $FilePath."
        }
        $commandPath = (Get-Command $FilePath -ErrorAction Stop).Source
        $Psi.FileName = $env:ComSpec
        $Psi.Arguments = ('/d /s /c ""{0}" {1}"' -f $commandPath, $serializedArguments)
    } else {
        $Psi.FileName = $FilePath
        $Psi.Arguments = $serializedArguments
    }
}

function Start-ServiceProcess([string]$Name,[string]$FilePath,[string[]]$Arguments,[string]$WorkingDirectory,[int]$Port,[hashtable]$ServiceEnvironment) {
    $pidFile=Join-Path $runtimeDir "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPidStr = Get-Content $pidFile -Raw -ErrorAction SilentlyContinue
        if ($oldPidStr) {
            $oldPid = [int]$oldPidStr.Trim()
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $oldPid" -ErrorAction SilentlyContinue
            if ($proc) {
                if (Test-ListenerOwnership -Port $Port -ServiceName $Name) {
                    Write-Host "$Name already running (PID $oldPid) from this repository"
                    return
                }
                $cmdLine = $proc.CommandLine
                if ($cmdLine -and $cmdLine.Contains($repoRoot)) {
                    # The pid file records the process Start-ServiceProcess launched.
                    # On Windows the venv python.exe is a redirector shim whose real
                    # interpreter runs as a child; uvicorn --workers adds more
                    # children. A live recorded PID alone does not prove the server
                    # is still listening -- if the port is free the recorded process
                    # is a stale shim with a dead server child. Verify the port too;
                    # only then is the service genuinely "already running".
                    Write-Host "$Name PID file points to live PID $oldPid but port $Port is not listening; restarting $Name..."
                    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
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

    # Remove stale non-secret launcher artifacts left by the rejected Phase 4
    # attempt.  A service is started directly with ProcessStartInfo so its
    # environment block exists only in memory.
    Remove-Item (Join-Path $runtimeDir "$Name.launch.bat") -Force -ErrorAction SilentlyContinue

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.FileName = $FilePath
    Set-ProcessLaunchCommand -Psi $psi -FilePath $FilePath -Arguments $Arguments

    $runtimeEnvironment = @(
        'PYTHONUTF8','PAAX_REPO_ROOT','PAAX_COMMIT','PAAX_BRANCH','PAAX_DIRTY',
        'PAAX_DATA_ROOT','PAAX_PORTABLE_DATA_DIR','PAAX_SERVICE_IDENTITY_REGISTRY','DB_API_URL',
        'NEXT_PUBLIC_DB_API_URL','NEXT_PUBLIC_USE_DB','CORE_ENGINE_URL',
        'NEXT_PUBLIC_CORE_ENGINE_URL','DOCUMENT_INTELLIGENCE_URL',
        'NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL','AI_ORCHESTRATOR_URL',
        'PAAX_AGENT_RUN_STORE','PAAX_AGENT_EVENT_JOURNAL','PAAX_AGENT_DEAD_LETTER',
        'PAAX_TAKEOFF_STORE','PAAX_ENTITY_LINK_STORE'
    )
    foreach ($environmentName in $runtimeEnvironment) {
        $value = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Runtime environment '$environmentName' kosong; startup dihentikan." }
        $psi.EnvironmentVariables[$environmentName] = $value
    }
    foreach ($environmentName in $ServiceEnvironment.Keys) {
        $value = [string]$ServiceEnvironment[$environmentName]
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Service environment '$environmentName' kosong; startup dihentikan." }
        $psi.EnvironmentVariables[$environmentName] = $value
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    if (-not $process.Start()) { throw "Gagal menjalankan service $Name melalui ProcessStartInfo." }
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -MessageData $outLog -Action {
        if ($Event.SourceEventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $Event.SourceEventArgs.Data }
    } | Out-Null
    Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -MessageData $errLog -Action {
        if ($Event.SourceEventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $Event.SourceEventArgs.Data }
    } | Out-Null

    Set-Content -LiteralPath $pidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))"
}

function Start-WorkerProcess([string]$Name,[string]$FilePath,[string[]]$Arguments,[string]$WorkingDirectory,[hashtable]$ServiceEnvironment) {
    # Identical to Start-ServiceProcess but for background workers that do not
    # listen on a TCP port (no port ownership check, no port-based liveness
    # guard -- the pid file alone tracks the process).
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
                }
                if ($cmdLine -and -not $cmdLine.Contains($repoRoot)) {
                    throw "PID file $Name.pid menunjuk ke PID $oldPid dari repository lain ($cmdLine). Hentikan worker lama terlebih dahulu."
                }
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    $outLog = Join-Path $runtimeDir "$Name.out.log"
    $errLog = Join-Path $runtimeDir "$Name.err.log"

    Remove-Item (Join-Path $runtimeDir "$Name.launch.bat") -Force -ErrorAction SilentlyContinue

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    Set-ProcessLaunchCommand -Psi $psi -FilePath $FilePath -Arguments $Arguments

    $runtimeEnvironment = @(
        'PYTHONUTF8','PAAX_REPO_ROOT','PAAX_COMMIT','PAAX_BRANCH','PAAX_DIRTY',
        'PAAX_DATA_ROOT','PAAX_PORTABLE_DATA_DIR','PAAX_SERVICE_IDENTITY_REGISTRY','DB_API_URL',
        'NEXT_PUBLIC_DB_API_URL','NEXT_PUBLIC_USE_DB','CORE_ENGINE_URL',
        'NEXT_PUBLIC_CORE_ENGINE_URL','DOCUMENT_INTELLIGENCE_URL',
        'NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL','AI_ORCHESTRATOR_URL',
        'PAAX_AGENT_RUN_STORE','PAAX_AGENT_EVENT_JOURNAL','PAAX_AGENT_DEAD_LETTER',
        'PAAX_TAKEOFF_STORE','PAAX_ENTITY_LINK_STORE'
    )
    foreach ($environmentName in $runtimeEnvironment) {
        $value = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Runtime environment '$environmentName' kosong; startup dihentikan." }
        $psi.EnvironmentVariables[$environmentName] = $value
    }
    foreach ($environmentName in $ServiceEnvironment.Keys) {
        $value = [string]$ServiceEnvironment[$environmentName]
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Service environment '$environmentName' kosong; startup dihentikan." }
        $psi.EnvironmentVariables[$environmentName] = $value
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    if (-not $process.Start()) { throw "Gagal menjalankan worker $Name melalui ProcessStartInfo." }
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -MessageData $outLog -Action {
        if ($Event.SourceEventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $Event.SourceEventArgs.Data }
    } | Out-Null
    Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -MessageData $errLog -Action {
        if ($Event.SourceEventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $Event.SourceEventArgs.Data }
    } | Out-Null

    Set-Content -LiteralPath $pidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))"
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

function Get-PidSafe([string]$Path) {
    if (Test-Path $Path) {
        $val = Get-Content $Path -Raw -ErrorAction SilentlyContinue
        if ($val) { return $val.Trim() }
    }
    return ""
}

Start-ServiceProcess "db-plhut" $venvPython @("scripts/live_test/serve_db_with_fixture.py") $repoRoot 8001 $serviceEnvironment["db-plhut"]
Wait-Health "db-plhut" "http://127.0.0.1:8001/health"

Start-ServiceProcess "core-engine" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8081") (Join-Path $repoRoot "services\core-engine") 8081 $serviceEnvironment["core-engine"]
Wait-Health "core-engine" "http://127.0.0.1:8081/health"

# document-intelligence: run 2 uvicorn workers. A single worker serializes every
# route on one event loop (fitz thumbnail/page renders, index, intelligence,
# artifact-url, artifact), which made a 25MB PDF artifact wait ~100s behind
# renders (ORION-F5 blocker). Multi-worker is safe here:
#   - ARTIFACT_STORE is LocalArtifactStore (filesystem .artifacts): reads are
#     process-safe; thumbnail cache writes are idempotent (same bytes).
#   - pdf-binary-cache lives in the BROWSER (apps/web pdf-binary-cache.ts Map),
#     so backend worker count cannot break its single-flight semantics.
#   - JOB_QUEUE_BACKEND=durable-db: enqueues go to services/db (durable_jobs
#     table), not the per-process in-memory store.  The extraction worker
#     (document-intelligence-worker below) leases and processes those jobs.
Start-ServiceProcess "document-intelligence" $venvPython @("-m","uvicorn","app.main:app","--workers","2","--host","127.0.0.1","--port","8083") (Join-Path $repoRoot "services\document-intelligence") 8083 $serviceEnvironment["document-intelligence"]
Wait-Health "document-intelligence" "http://127.0.0.1:8083/health"

# document-intelligence-worker: durable extraction worker (P0 FIX).
# Runs python -m app.durable_worker_main from services/document-intelligence.
# Leases dem.extract / dem.synthesize jobs from services/db (durable_jobs table)
# and calls process_document.  This is the ONLY path that produces pages,
# sheets, and quantities -- dem_routes.py enqueues the job; this process
# actually executes it.  Worker does not listen on a TCP port.
Start-WorkerProcess "document-intelligence-worker" $venvPython @("-m","app.durable_worker_main") (Join-Path $repoRoot "services\document-intelligence") $serviceEnvironment["document-intelligence"]
# Give the worker a moment to start and emit its "durable worker ... starting"
# log line; if it crashes immediately the pid file will exist but the process
# will be gone -- callers can detect that via the pid file / out.log check.
Start-Sleep -Milliseconds 2000
$workerPid = Get-PidSafe (Join-Path $runtimeDir "document-intelligence-worker.pid")
if ($workerPid) {
    $workerProc = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid" -ErrorAction SilentlyContinue
    if (-not $workerProc) {
        $workerErrLog = Join-Path $runtimeDir "document-intelligence-worker.err.log"
        $errTail = if (Test-Path $workerErrLog) { (Get-Content $workerErrLog -Tail 20) -join "`n" } else { "(no log)" }
        throw "document-intelligence-worker crashed at startup. Periksa log: $workerErrLog`n$errTail"
    }
    Write-Host "READY document-intelligence-worker (PID $workerPid)"
} else {
    throw "document-intelligence-worker PID file tidak ditemukan setelah start."
}

if (-not $SkipOptionalServices) {
    Start-ServiceProcess "ai-orchestrator" "corepack.cmd" @($packageManager,"--dir","services/ai-orchestrator","dev") $repoRoot 8082 $serviceEnvironment["ai-orchestrator"]
    Wait-Health "ai-orchestrator" "http://127.0.0.1:8082/health" 120

    Start-ServiceProcess "site-agent" $venvPython @("-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8085") (Join-Path $repoRoot "services\site-agent") 8085 $serviceEnvironment["site-agent"]
    Wait-Health "site-agent" "http://127.0.0.1:8085/health" 90
}

# The portable runtime uses a verified production bundle.  `next dev` can stop
# accepting connections on Windows after a proxy route is compiled, which makes
# a health-only startup falsely appear ready.  Fail closed when no bundle exists
# rather than falling back to that unstable development server.
$webBuildId = Join-Path $repoRoot "apps\web\.next\BUILD_ID"
if (-not (Test-Path $webBuildId)) { throw "Web production bundle tidak ditemukan. Jalankan 'pnpm --dir apps/web build' sebelum startup portable." }
$serviceEnvironment["web"]["PAAX_PORTABLE_ACTOR_ID"] = "local-desktop-user"
Start-ServiceProcess "web" "corepack.cmd" @($packageManager,"--dir","apps/web","start","--hostname","127.0.0.1") $repoRoot 3000 $serviceEnvironment["web"]
Wait-Health "web" "http://127.0.0.1:3000/api/health" 180

function Get-PidSafe([string]$Path) {
    # NOTE: This function is also defined before service startups above
    # (after Wait-Health) so that it is available before the web service starts.
    # This duplicate definition is intentional as a safety net; PowerShell uses
    # the last definition encountered during parse, so this is always consistent.
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
        "document-intelligence-worker" = @{ port = 0; pid = (Get-PidSafe (Join-Path $runtimeDir "document-intelligence-worker.pid")) }
        "ai-orchestrator" = if (-not $SkipOptionalServices) { @{ port = 8082; pid = (Get-PidSafe (Join-Path $runtimeDir "ai-orchestrator.pid")) } } else { $null }
        "site-agent" = if (-not $SkipOptionalServices) { @{ port = 8085; pid = (Get-PidSafe (Join-Path $runtimeDir "site-agent.pid")) } } else { $null }
        "web" = @{ port = 3000; pid = (Get-PidSafe (Join-Path $runtimeDir "web.pid")) }
    }
}
$manifestJson = ConvertTo-Json $manifestData -Depth 5
[IO.File]::WriteAllText((Join-Path $runtimeDir "runtime-manifest.json"), $manifestJson)

Write-Host "PAAX siap: http://127.0.0.1:3000 - Data Root: $resolvedRoot"
