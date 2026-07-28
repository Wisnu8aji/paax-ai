[CmdletBinding()] param([string]$DataRoot)
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

. (Join-Path $repoRoot "scripts\portable\Resolve-PAAX-DataRoot.ps1")
$resolvedRoot = Resolve-PaaxDataRoot -DataRoot $DataRoot -InstallRoot $repoRoot

$runtimeDir=Join-Path $resolvedRoot "runtime"
if (Test-Path $runtimeDir) {
    Get-ChildItem $runtimeDir -Filter *.pid -ErrorAction SilentlyContinue | ForEach-Object {
        $pidValue=[int](Get-Content $_.FullName -Raw)
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
        Remove-Item $_.FullName -Force
    }
}
Write-Host "PAAX portable services stopped. Persistent data remains in $resolvedRoot."
