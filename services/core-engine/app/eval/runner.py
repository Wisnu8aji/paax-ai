from __future__ import annotations

from .models import EvalCaseResult, EvalRunRequest, EvalRunResult, EvalSummary


def run_eval(req: EvalRunRequest) -> EvalRunResult:
    results: list[EvalCaseResult] = []
    for case in req.cases:
        if case.actual is not None and case.expected is not None:
            delta = abs(case.actual - case.expected)
            passed = delta <= case.tolerance + 1e-12
            results.append(EvalCaseResult(
                id=case.id,
                passed=passed,
                delta=round(delta, 10),
                reason=f"|actual-expected|={delta:g} <= tolerance {case.tolerance:g}" if passed
                else f"|actual-expected|={delta:g} > tolerance {case.tolerance:g}",
            ))
            continue
        if case.actual_json is not None or case.expected_json is not None:
            passed = case.actual_json == case.expected_json
            results.append(EvalCaseResult(
                id=case.id,
                passed=passed,
                reason="structural JSON match" if passed else "structural JSON mismatch",
            ))
            continue
        results.append(EvalCaseResult(
            id=case.id,
            passed=False,
            reason="case has no numeric or structural expected value",
        ))

    passed_count = sum(1 for r in results if r.passed)
    return EvalRunResult(
        results=results,
        summary=EvalSummary(total=len(results), passed=passed_count, failed=len(results) - passed_count),
    )
