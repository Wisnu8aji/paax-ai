[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$TargetPath,
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$target=[IO.Path]::GetFullPath($TargetPath)
$backup=[IO.Path]::GetFullPath($BackupPath)
if (Test-Path (Join-Path $target "scripts\portable\Stop-PLHUT-Local.ps1")) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $target "scripts\portable\Stop-PLHUT-Local.ps1")
}
$args=@((Join-Path $repoRoot "scripts\portable\rollback_paax_main.py"),"--target",$target,"--backup",$backup)
if ($DryRun) { $args += "--dry-run" }
python @args
if ($LASTEXITCODE -ne 0) { throw "Rollback gagal" }
Write-Host "Rollback selesai. Runtime state saat ini dipertahankan. Jalankan Setup dan Start dari target."
