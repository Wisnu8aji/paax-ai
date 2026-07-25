[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$venvPython = Join-Path $repoRoot ".venv\\Scripts\\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "Environment belum disiapkan. Jalankan .\\scripts\\portable\\Setup-PLHUT-Local.ps1 terlebih dahulu."
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".env.local"))) {
    throw ".env.local belum ada. Salin .env.local.example, lalu isi key provider Anda."
}

$webEnv = Join-Path $repoRoot "apps\\web\\.env.local"
if (-not (Test-Path -LiteralPath $webEnv)) {
    Copy-Item -LiteralPath (Join-Path $repoRoot ".env.local") -Destination $webEnv
}

$runtimeDir = Join-Path $repoRoot ".local-runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$env:PYTHONUTF8 = "1"
$env:INTERNAL_SERVICE_KEY = "live-test-key"
$env:DB_API_URL = "http://127.0.0.1:8001"
$env:NEXT_PUBLIC_DB_API_URL = "http://127.0.0.1:8001"
$env:NEXT_PUBLIC_USE_DB = "true"
$env:CORE_ENGINE_URL = "http://127.0.0.1:8081"
$env:NEXT_PUBLIC_CORE_ENGINE_URL = "http://127.0.0.1:8081"
$env:DOCUMENT_INTELLIGENCE_URL = "http://127.0.0.1:8083"
$env:NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL = "http://127.0.0.1:8083"

function Start-PaaxProcess {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [string[]] $Arguments,
        [Parameter(Mandatory)] [string] $WorkingDirectory
    )

    $stdout = Join-Path $runtimeDir "$Name.out.log"
    $stderr = Join-Path $runtimeDir "$Name.err.log"
    Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
}

Start-PaaxProcess -Name "db-plhut" -FilePath $venvPython `
    -Arguments @("scripts/live_test/serve_db_with_fixture.py") -WorkingDirectory $repoRoot
Start-PaaxProcess -Name "core-engine" -FilePath $venvPython `
    -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8081") `
    -WorkingDirectory (Join-Path $repoRoot "services\\core-engine")
Start-PaaxProcess -Name "document-intelligence" -FilePath $venvPython `
    -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8083") `
    -WorkingDirectory (Join-Path $repoRoot "services\\document-intelligence")
Start-PaaxProcess -Name "ai-orchestrator" -FilePath "pnpm.cmd" `
    -Arguments @("--dir", "services/ai-orchestrator", "dev") -WorkingDirectory $repoRoot
Start-PaaxProcess -Name "site-agent" -FilePath $venvPython `
    -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8085") `
    -WorkingDirectory (Join-Path $repoRoot "services\\site-agent")
Start-PaaxProcess -Name "web" -FilePath "pnpm.cmd" `
    -Arguments @("--dir", "apps/web", "dev") -WorkingDirectory $repoRoot

Write-Host "PAAX PLHUT sedang dinyalakan di background. Buka http://127.0.0.1:3000 setelah web siap."
Write-Host "Log lokal: $runtimeDir"
