[CmdletBinding()]
param(
    [string]$Source = "",
    [Parameter(Mandatory)][string]$Target,
    [switch]$DryRun,
    [switch]$ForceReplace
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Python virtual environment not found. Please run Setup-PLHUT-Local.ps1 first."
}

$args = @("scripts/portable/migrate_data.py", "--target", $Target)
if ($Source) { $args += "--source"; $args += $Source }
if ($DryRun) { $args += "--dry-run" }
if ($ForceReplace) { $args += "--force-replace" }

& $venvPython $args
if ($LASTEXITCODE -ne 0) {
    throw "Migration failed."
}
