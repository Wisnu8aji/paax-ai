param(
  [Parameter(Mandatory=$true)][string]$PdfPath,
  [string]$BaseUrl = 'http://127.0.0.1:3000'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $PdfPath)) { throw "Authorized fixture not found: $PdfPath" }
if ($env:DRAWING_INTELLIGENCE_API_KEY) { throw 'Provider key must be absent during the real viewer/browser gate.' }
$env:DI_E2E_URL = "$BaseUrl/gambar-kerja-ai"
Write-Host "Fixture: $PdfPath"
Write-Host 'Start Web + Document Intelligence locally, then run Playwright against the real stack.'
Write-Host 'Required proof: first-page paint, pan/zoom, minimap, 53 pages, three sheet views, Takeoff/Mission recovery, no pageerror, 1440px and 390px screenshots.'
