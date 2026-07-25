[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$TargetPath,
  [ValidateSet("overlay","replace-managed")][string]$Mode="replace-managed",
  [switch]$SkipSetup,
  [switch]$SkipStart
)
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$sourceRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$target=[IO.Path]::GetFullPath($TargetPath)
Write-Host "PAAX update source: $sourceRoot"
Write-Host "PAAX update target: $target"

$stopScript=Join-Path $target "scripts\portable\Stop-PLHUT-Local.ps1"
if (Test-Path $stopScript) {
  Write-Host "Menghentikan runtime lama sebelum update..."
  powershell -ExecutionPolicy Bypass -File $stopScript
}

python (Join-Path $sourceRoot "scripts\portable\update_paax_main.py") --source $sourceRoot --target $target --mode $Mode
if ($LASTEXITCODE -ne 0) { throw "Update source ke paax-ai-main gagal." }

if (-not $SkipSetup) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $target "scripts\portable\Setup-PLHUT-Local.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Setup dependency/migration gagal." }
}
if (-not $SkipStart) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $target "scripts\portable\Start-PLHUT-Local.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Runtime baru gagal dimulai." }
}
Write-Host "Update selesai. Project PLHUT akan dibuat/diperbaiki secara idempotent saat DB service start."
