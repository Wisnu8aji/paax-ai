[CmdletBinding()] param()
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

function Assert-Version([string]$Name,[string]$Actual,[version]$Minimum,[version]$Maximum=$null) {
    $clean = ($Actual -replace '[^0-9\.]','').Trim('.')
    try { $version = [version]$clean } catch { throw "$Name version tidak dapat dibaca: $Actual" }
    if ($version -lt $Minimum) { throw "$Name $Minimum+ diperlukan; ditemukan $Actual" }
    if ($Maximum -and $version -gt $Maximum) { throw "$Name maksimal $Maximum; ditemukan $Actual" }
    Write-Host "OK $Name $version"
}

$node = Get-Command node -ErrorAction SilentlyContinue
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js 20+ tidak ditemukan." }
if (-not $python) { throw "Python 3.11-3.13 tidak ditemukan." }
Assert-Version "Node.js" (& node --version) ([version]"20.0")
$pythonVersion = (& python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))").Trim()
Assert-Version "Python" $pythonVersion ([version]"3.11") ([version]"3.13.99")

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm belum tersedia; mengaktifkan Corepack..."
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
}
Assert-Version "pnpm" (& pnpm --version) ([version]"9.0")

Write-Host "Memasang dependency Node secara reproducible..."
pnpm install --frozen-lockfile

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { python -m venv .venv }
& $venvPython -m pip install --upgrade pip

function Install-Editable([string]$Path) {
    Write-Host "Installing $Path"
    & $venvPython -m pip install -e $Path
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build isolation gagal untuk $Path; mencoba mode offline-compatible."
        & $venvPython -m pip install --no-build-isolation -e $Path
        if ($LASTEXITCODE -ne 0) { throw "Gagal memasang $Path" }
    }
}

Install-Editable ".\packages\schemas\python"
Install-Editable ".\services\core-engine"
Install-Editable ".\services\document-intelligence"
Install-Editable ".\services\db[dev]"
Install-Editable ".\services\site-agent"

# Templates are credential-free. Runtime creates one shared random service key
# under .local-runtime; it is never written back to the release archive.
foreach ($target in @(".env.local", "apps\web\.env.local")) {
    if (-not (Test-Path $target)) { Copy-Item .env.local.example $target }
}
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "data\portable") | Out-Null
& $venvPython scripts\portable\preflight.py
if ($LASTEXITCODE -ne 0) { throw "Portable preflight gagal setelah setup." }
Write-Host "Setup selesai. Jalankan scripts\portable\Start-PLHUT-Local.ps1"
