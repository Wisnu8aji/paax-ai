param(
  [Parameter(Mandatory=$true)][string]$PdfPath,
  [Parameter(Mandatory=$true)][string]$OutputJson
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $PdfPath)) { throw "Fixture not found: $PdfPath" }
Write-Host 'Capture exactly three cold and three warm runs on the same laptop/browser/DPR/viewport.'
Write-Host 'Do not populate the baseline with estimated or synthetic timing data.'
Write-Host "Write raw samples to: $OutputJson"
