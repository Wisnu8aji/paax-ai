[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
Set-Location $repoRoot

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm tidak ditemukan. Instal Node.js 20+ lalu jalankan: corepack enable"
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.11+ tidak ditemukan."
}

pnpm install --frozen-lockfile

$venvPython = Join-Path $repoRoot ".venv\\Scripts\\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv .venv
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -e .\\packages\\schemas\\python
& $venvPython -m pip install -e .\\services\\core-engine
& $venvPython -m pip install -e .\\services\\document-intelligence
& $venvPython -m pip install -e ".\\services\\db[dev]"
& $venvPython -m pip install -e .\\services\\site-agent

$rootEnv = Join-Path $repoRoot ".env.local"
if (-not (Test-Path -LiteralPath $rootEnv)) {
    Copy-Item -LiteralPath (Join-Path $repoRoot ".env.local.example") -Destination $rootEnv
    Write-Warning "Buat .env.local dari template. Isi API key provider Anda sebelum memakai Command Room model eksternal."
}

$webEnv = Join-Path $repoRoot "apps\\web\\.env.local"
if (-not (Test-Path -LiteralPath $webEnv)) {
    Copy-Item -LiteralPath $rootEnv -Destination $webEnv
}

Write-Host "Setup selesai. Jalankan .\\scripts\\portable\\Start-PLHUT-Local.ps1"
