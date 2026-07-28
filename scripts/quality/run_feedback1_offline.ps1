$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
$env:DI_ENABLE_LIVE_AI_TESTS = 'false'
Remove-Item Env:DRAWING_INTELLIGENCE_API_KEY -ErrorAction SilentlyContinue
$evidencePath = Join-Path $repo 'report\report_drawing_intelligence\FEEDBACK1_OFFLINE_EVIDENCE_2026-07-27.json'
try {
  python scripts/quality/feedback1_matrix.py --check
  python scripts/quality/check_no_production_di_dummy.py
  $env:PYTHONPATH = 'packages/schemas/python;services/document-intelligence'
  python -m pytest `
    services/document-intelligence/tests/test_sheet_views.py `
    packages/schemas/python/tests/test_sheet_view_schema.py `
    services/document-intelligence/tests/test_sheet_classification_assist.py `
    services/document-intelligence/tests/test_dem_thumbnail_routes.py `
    services/document-intelligence/tests/test_dem_active_sheet_context.py `
    services/document-intelligence/tests/test_human_delivery_candidate_inventory.py `
    services/document-intelligence/tests/test_takeoff_capabilities.py `
    services/document-intelligence/tests/test_general_calculation_bridge.py `
    services/document-intelligence/tests/test_ai_proposal_audit.py `
    services/document-intelligence/tests/test_controlled_benchmark_router.py `
    services/document-intelligence/tests/test_feedback1_offline_contracts.py `
    services/document-intelligence/tests/test_no_synthetic_delivery_claims.py -q

  $env:PYTHONPATH = 'packages/schemas/python;services/core-engine'
  python -m pytest services/core-engine/tests/test_feedback1_engine_authority.py services/core-engine/tests/test_calculation_boundary.py -q

  Push-Location services/db
  python -m pytest tests/test_rab_materialize.py -q
  Pop-Location

  pnpm --filter @paax/schemas test
  pnpm --filter @paax/schemas exec tsc --noEmit
  pnpm --filter @paax/ai-orchestrator test
  pnpm --filter @paax/ai-orchestrator exec tsc --noEmit
  pnpm --filter @paax/web test -- `
    src/components/drawing-intelligence/workspace/navigator/__tests__/file-sheet-navigator.test.tsx `
    src/components/drawing-intelligence/workspace/__tests__/workspace-mode-actions.test.tsx `
    src/components/drawing-intelligence/workspace/__tests__/feedback1-ui-contracts.test.ts `
    src/components/drawing-intelligence/workspace/canvas/performance-metrics.test.ts
  pnpm --filter @paax/web exec tsc --noEmit

  $payload = @{
    status = 'passed'
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    provider_network = 'disabled'
    api_key_present = $false
    matrix = 'P2-P62 validated'
    note = 'All Feedback 1 offline gates completed; browser and live-provider gates remain separate.'
  } | ConvertTo-Json -Depth 4
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $evidencePath) | Out-Null
  Set-Content -Path $evidencePath -Value $payload -Encoding UTF8
  Write-Host "Offline Feedback 1 gate passed. Evidence: $evidencePath"
} catch {
  $payload = @{
    status = 'failed'
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    provider_network = 'disabled'
    error = $_.Exception.Message
  } | ConvertTo-Json -Depth 4
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $evidencePath) | Out-Null
  Set-Content -Path $evidencePath -Value $payload -Encoding UTF8
  throw
}
