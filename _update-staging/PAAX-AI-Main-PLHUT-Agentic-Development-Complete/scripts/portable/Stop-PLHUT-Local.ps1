[CmdletBinding()] param()
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeDir=Join-Path $repoRoot ".local-runtime"
Get-ChildItem $runtimeDir -Filter *.pid -ErrorAction SilentlyContinue | ForEach-Object {
  $pidValue=[int](Get-Content $_.FullName -Raw)
  Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  Remove-Item $_.FullName -Force
}
Write-Host "PAAX portable services stopped. Persistent data remains in data\portable."
