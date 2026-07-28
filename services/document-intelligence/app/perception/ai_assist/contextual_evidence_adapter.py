"""Re-export ContextualEvidenceAdapter for perception ai_assist module."""
from app.project_graph.contextual_evidence_adapter import (
    ContextualEvidenceAdapter,
    ContextualEvidenceBundleResult,
    ContextualFactProposalResult,
)

__all__ = [
    "ContextualEvidenceAdapter",
    "ContextualEvidenceBundleResult",
    "ContextualFactProposalResult",
]
