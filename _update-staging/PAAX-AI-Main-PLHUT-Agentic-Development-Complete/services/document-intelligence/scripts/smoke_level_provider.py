"""Optional live smoke test for the Drawing Intelligence level provider.

Run manually from ``services/document-intelligence`` after setting the dedicated
``DRAWING_INTELLIGENCE_*`` environment variables. This script is not imported by
pytest and never prints the API key.
"""
from __future__ import annotations

import json
import os

from app.project_graph.level_canonicalizer import LevelSemanticCandidate
from app.project_graph.providers.deepseek import DeepSeekLevelProvider


def _candidate(raw: str, canonical_levels: tuple[str, ...]) -> LevelSemanticCandidate:
    return LevelSemanticCandidate(
        candidate_id=f"SMOKE-{raw.upper().replace(' ', '-')}",
        raw=raw,
        normalized=raw,
        classification="UNCLASSIFIED",
        deterministic_canonical=None,
        canonical_levels=canonical_levels,
        evidence_refs=("FIXTURE-LEVEL-1",),
        context={"fixture": "synthetic-level-provider-smoke"},
    )


def main() -> int:
    # This is an explicitly live script; normal synthesis remains deterministic
    # unless a service operator opts in with the same flag.
    os.environ["DRAWING_INTELLIGENCE_LEVEL_PROVIDER"] = "1"
    provider = DeepSeekLevelProvider.from_env()
    if provider is None:
        print("DRAWING_INTELLIGENCE_API_KEY is not configured; smoke skipped.")
        return 2

    for candidate in (
        _candidate("Main Level Two", ("Lantai 1", "Lantai 2", "Atap")),
        _candidate("First Floor", ("Lantai 1", "Lantai 2", "Atap")),
    ):
        flash = provider.propose(candidate, tier="flash")
        output = {
            "candidate_id": candidate.candidate_id,
            "tier": "flash",
            "model": flash.model,
            "prompt_version": flash.prompt_version,
            "prompt_hash": flash.prompt_hash,
            "input": candidate.as_audit_input(),
            "output": dict(flash.payload),
        }
        confidence = flash.payload.get("confidence")
        if not isinstance(confidence, (int, float)) or confidence < 0.75:
            pro = provider.propose(candidate, tier="pro")
            output["pro"] = {
                "model": pro.model,
                "prompt_version": pro.prompt_version,
                "prompt_hash": pro.prompt_hash,
                "output": dict(pro.payload),
            }
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
