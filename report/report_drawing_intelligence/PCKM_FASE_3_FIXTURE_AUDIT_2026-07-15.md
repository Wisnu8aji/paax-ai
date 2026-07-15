# PCKM Phase 3 Fixture Audit - 2026-07-15

## Scope

- Stored JSON pages audited: 88
- Evidence references: 3807
- Dangling evidence references: 839
- Pages with dangling references: 47
- Source files were read without modification.

## Discipline Mapping

| Source field | Observed value | Canonical value | Pages |
| --- | --- | --- | ---: |
| value | (empty) | unresolved | 1 |
| value | Architectural | architecture | 2 |
| value | architectural | architecture | 1 |
| value | Architecture | architecture | 5 |
| value | ARSITEKTUR | architecture | 8 |
| value | Arsitektur | architecture | 12 |
| value | arsitektur | architecture | 7 |
| value | Arsitektur/MEP | general | 1 |
| value | Elektrikal / Penangkal Petir | mep | 1 |
| value | interior design | architecture | 1 |
| value | mekanikal | mep | 1 |
| value | MEP | mep | 23 |
| value | MEP-Electrical | mep | 1 |
| value | Plumbing | mep | 2 |
| value | SIPIL | structure | 1 |
| value | Sipil | structure | 1 |
| value | Structural | structure | 1 |
| value | Structure | structure | 1 |
| value | STRUKTUR | structure | 7 |
| value | Struktur | structure | 10 |
| value | struktur | structure | 1 |

## Dangling References By Section

| Section | References | Dangling | Affected pages |
| --- | ---: | ---: | ---: |
| observations | 3549 | 775 | 40 |
| sheet_identity | 258 | 64 | 26 |

## Observation Reference Distribution

| Category | References | Dangling | Dangling rate | Affected pages |
| --- | ---: | ---: | ---: | ---: |
| dimensions | 905 | 218 | 24.09% | 22 |
| element_labels | 419 | 55 | 13.13% | 15 |
| geometry_descriptions | 113 | 20 | 17.70% | 13 |
| grids | 355 | 74 | 20.85% | 13 |
| levels | 116 | 24 | 20.69% | 9 |
| materials | 172 | 23 | 13.37% | 6 |
| notes | 86 | 24 | 27.91% | 13 |
| patterns | 54 | 13 | 24.07% | 7 |
| references | 42 | 3 | 7.14% | 3 |
| spaces | 98 | 27 | 27.55% | 10 |
| symbols | 182 | 57 | 31.32% | 15 |
| tables | 36 | 14 | 38.89% | 10 |
| texts | 971 | 223 | 22.97% | 33 |

- Pattern: dangling references occur in all 13 observation categories; the defect is broad rather than isolated to one payload section.
- Highest dangling rates: tables, symbols, notes, spaces.
- Patch decision: retain facts from every observation category, intersect source references with evidence IDs that exist, and record unresolved references for review instead of dropping the fact.

## Merge Candidates

Recurring normalized element codes: 36

| Code | Occurrences | Candidate partitions | Confidence | Pages | Disciplines | Risk | Escalate |
| --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| B1 | 3 | 1 | 0.95 | 44, 51, 52 | structure | 0.00 | no |
| B2 | 5 | 1 | 0.95 | 44, 51, 52, 54 | structure | 0.15 | no |
| B3 | 4 | 1 | 0.95 | 44, 51, 52, 54 | structure | 0.15 | no |
| BV1 | 11 | 1 | 0.95 | 21, 22, 23 | architecture | 0.00 | no |
| CB1 | 2 | 1 | 0.95 | 51, 52 | structure | 0.00 | no |
| CG2A | 2 | 1 | 0.96 | 44, 54 | structure | 0.00 | no |
| G1 | 5 | 1 | 0.95 | 44, 51, 52, 54 | structure | 0.15 | no |
| G2 | 6 | 1 | 0.95 | 44, 51, 52, 54 | structure | 0.15 | no |
| G3 | 3 | 1 | 0.95 | 44, 51, 52 | structure | 0.00 | no |
| J1 | 2 | 1 | 0.95 | 21, 27 | architecture | 0.00 | no |
| J2 | 7 | 1 | 0.95 | 21, 22, 27 | architecture | 0.00 | no |
| J3 | 3 | 1 | 0.95 | 21, 23, 28 | architecture | 0.00 | no |
| J4 | 8 | 1 | 0.98 | 21, 22, 28 | architecture | 0.00 | no |
| J5 | 3 | 1 | 0.95 | 21, 23, 29 | architecture | 0.00 | no |
| J6 | 2 | 1 | 0.95 | 21, 30 | architecture | 0.10 | no |
| K01 | 4 | 2 | 0.90 | 7, 24, 37, 87 | architecture, structure | 0.40 | yes |
| K1 | 3 | 1 | 0.96 | 42, 50, 54 | structure | 0.00 | no |
| K1A | 15 | 1 | 0.95 | 42, 43, 54 | structure | 0.00 | no |
| K2 | 7 | 1 | 0.95 | 42, 43, 50, 54 | structure | 0.15 | no |
| K3 | 6 | 1 | 0.95 | 42, 43, 50, 54 | structure | 0.15 | no |
| KD1 | 2 | 2 | 0.95 | 46, 56 | architecture, structure | 0.25 | yes |
| P1 | 8 | 2 | 0.90 | 4, 21, 25, 87 | architecture, general | 0.40 | yes |
| P2 | 4 | 2 | 0.90 | 4, 21, 22, 26 | architecture, general | 0.40 | yes |
| P3 | 5 | 1 | 0.98 | 21, 22, 26 | architecture | 0.10 | no |
| P4 | 2 | 1 | 0.98 | 21, 26 | architecture | 0.10 | no |
| PC1 | 13 | 1 | 0.98 | 39, 49 | structure | 0.10 | no |
| PJ1 | 2 | 1 | 0.99 | 21, 25 | architecture | 0.10 | no |
| RB1 | 2 | 1 | 0.95 | 54, 55 | structure | 0.00 | no |
| RB3 | 6 | 1 | 0.95 | 44, 54, 55, 56 | structure | 0.15 | no |
| RB4 | 4 | 1 | 0.95 | 54, 55, 56 | structure | 0.00 | no |
| S1 | 2 | 1 | 0.99 | 44, 53 | structure | 0.00 | no |
| S2 | 2 | 1 | 0.99 | 44, 53 | structure | 0.00 | no |
| SL1 | 3 | 2 | 0.98 | 41, 52, 57 | mep, structure | 0.25 | yes |
| SL2 | 2 | 1 | 0.98 | 41, 52 | structure | 0.10 | no |
| SL3 | 2 | 1 | 0.98 | 41, 52 | structure | 0.10 | no |
| STK2 | 5 | 1 | 0.95 | 59, 60 | mep | 0.10 | no |

## Risk Calibration

| Signal | Weight |
| --- | ---: |
| ambiguity | 0.30 |
| conflict | 0.30 |
| fanout | 0.15 |
| cross_discipline | 0.15 |
| low_evidence | 0.10 |

- Low-risk candidates: 33
- Moderate-risk candidates: 3
- High-risk candidates: 0
- Escalated candidates: 5
- Escalation percentage: 13.89%
- Calibration rationale: ambiguity and conflict each carry 0.30 because they can change graph identity; fanout and cross-discipline links each carry 0.15; low evidence carries 0.10 because facts remain usable with a review marker.
- The 0.50 threshold requires compounded weighted risk, preventing one weak signal from routing most exact matches to the escalation provider.
- Explicit escalation gates override the weighted threshold: multiple candidates, confidence below 0.78, detected conflict, cross-discipline resolution, or more than 20 affected nodes.
- Candidate count is the number of distinct normalized discipline partitions for an exact code; confidence is the minimum source-label confidence in that candidate group. Both gates are therefore evaluated against fixture data instead of left at defaults.

## Verification Evidence

- Initial RED: `python -m pytest tests/test_project_graph_fixture_audit.py -q` -> 18 failed because the audited modules did not exist.
- Review RED: the same focused command exposed 6 failures, then 5 failures, for missing escalation, raw-discipline, and report contracts.
- Focused GREEN: `python -m pytest tests/test_project_graph_fixture_audit.py -q` -> 28 passed.
- Full GREEN: `python -m pytest -q` -> 358 passed, 5 skipped; no image or network provider was invoked.
