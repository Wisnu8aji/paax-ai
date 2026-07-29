# Phase 10A Offline Test & Matrix Runner PowerShell Script
# Enforces offline execution, fail-closed matrix validation, pytest, vitest, and tsc check.

$ErrorActionPreference = "Stop"

Write-Host "=== Starting Phase 10A Feedback 1 Offline Test Suite ===" -ForegroundColor Cyan

# 1. Enforce network-disabled environment flags
$env:NO_NET = "1"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
$env:NODE_ENV = "test"

# 2. Run Matrix Check
Write-Host "`n[1/5] Running Feedback 1 Matrix Validator..." -ForegroundColor Yellow
python scripts/quality/feedback1_matrix.py --check
if ($LASTEXITCODE -ne 0) {
    Write-Error "Matrix validation failed!"
    exit 1
}

# 3. Run Document Intelligence Offline Contract Pytest
Write-Host "`n[2/5] Running Document Intelligence Offline Contracts (Pytest)..." -ForegroundColor Yellow
python -m pytest services/document-intelligence/tests/test_feedback1_offline_contracts.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Document Intelligence Pytest failed!"
    exit 1
}

# 4. Run Core Engine Authority Pytest
Write-Host "`n[3/5] Running Core Engine Authority Contracts (Pytest)..." -ForegroundColor Yellow
python -m pytest services/core-engine/tests/test_feedback1_engine_authority.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Core Engine Authority Pytest failed!"
    exit 1
}

# 5. Run Web Vitest Contract Suites
Write-Host "`n[4/5] Running Web UI Contracts (Vitest)..." -ForegroundColor Yellow
Push-Location apps/web
try {
    npx vitest run src/components/drawing-intelligence/workspace/__tests__/feedback1-ui-contracts.test.tsx src/components/drawing-intelligence/workspace/__tests__/handoff-safety-coverage.test.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Vitest UI contracts failed!"
        exit 1
    }

    # 6. Run TypeScript Typecheck
    Write-Host "`n[5/5] Running TypeScript Typecheck (tsc --noEmit)..." -ForegroundColor Yellow
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        Write-Error "TypeScript typecheck failed!"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`n=== ALL Phase 10A Offline Quality Gates PASSED Successfully ===" -ForegroundColor Green
exit 0
