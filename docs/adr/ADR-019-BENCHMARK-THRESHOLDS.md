# ADR-019: Deterministic Drawing Benchmark Thresholds

Version `f19.v1` gates Evidence, Semantic, Physical, Measurement, Retrieval, UI, and PLHUT non-regression using only local fixtures. Every metric is a normalized deterministic assertion (`1.0` means its fixture assertion passed); absent data fails. The manifest records definitions and the required synthetic-diversity contract for F19.2. No external API, extraction, or provider output is permitted.
