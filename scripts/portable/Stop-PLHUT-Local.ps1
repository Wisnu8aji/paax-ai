[CmdletBinding()] param([string]$DataRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

. (Join-Path $repoRoot "scripts\portable\Resolve-PAAX-DataRoot.ps1")
$resolvedRoot = Resolve-PaaxDataRoot -DataRoot $DataRoot -InstallRoot $repoRoot

$runtimeDir = Join-Path $resolvedRoot "runtime"

function Stop-PaaxPid([int]$pidValue) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
    if ($proc) {
        $cmd = $proc.CommandLine
        if ($proc.Name -match "python|node|cmd|powershell" -or $cmd -match "paax|uvicorn|next|tsx") {
            Write-Host "Stopping PAAX process PID $pidValue ($($proc.Name))..."
            Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
        }
    }
}

if (Test-Path $runtimeDir) {
    # 1. Read runtime manifest if present
    $manifestPath = Join-Path $runtimeDir "runtime-manifest.json"
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            if ($manifest.services) {
                foreach ($svc in $manifest.services.PSObject.Properties) {
                    if ($svc.Value -and $svc.Value.pid) {
                        Stop-PaaxPid -pidValue ([int]$svc.Value.pid)
                    }
                }
            }
        } catch {}
        Remove-Item $manifestPath -Force -ErrorAction SilentlyContinue
    }

    # 2. Process all .pid files in runtime directory
    Get-ChildItem $runtimeDir -Filter *.pid -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $pidVal = [int](Get-Content $_.FullName -Raw)
            Stop-PaaxPid -pidValue $pidVal
        } catch {}
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

# 3. Check for any remaining PAAX processes listening on standard PAAX ports
$paaxPorts = @(3000, 8001, 8081, 8082, 8083, 8085)
foreach ($port in $paaxPorts) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            $owningPid = $conn.OwningProcess
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
            if ($proc) {
                $cmd = $proc.CommandLine
                if ($cmd -match "paax|uvicorn|next|tsx|site-agent|core-engine|document-intelligence") {
                    Write-Host "Stopping orphan PAAX process on port $port (PID $owningPid)..."
                    Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host "PAAX portable services stopped safely. Persistent data remains in $resolvedRoot."
