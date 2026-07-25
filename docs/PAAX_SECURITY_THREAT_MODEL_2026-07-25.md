# PAAX Security Threat Model

## Assets
Original drawings, project graph, Measurement Facts, calculations, RAB/AHSP, agent memory, approvals, API keys, user identity, audit logs, and portable runtime data.

## Trust boundaries
Browser ↔ Next.js; Next.js ↔ DB/Core/DI/Agent services; agent ↔ tools; project ↔ tenant; uploaded document ↔ system policy; release archive ↔ local checkout.

## Primary threats and controls

| Threat | Control |
|---|---|
| Cross-project data access | Signed ProjectContextBinding, owner/member checks, scoped tools, negative isolation tests. |
| Prompt injection in drawings/specs | Uploaded content is untrusted evidence; instruction scanner; system/tool policy cannot be overridden by document text. |
| Secret leakage | `.env.local` excluded, random runtime key stored under `.local-runtime`, release secret scan, credential-free examples. |
| Unsupported quantity/calculation | Measurement authority lifecycle; Core Engine boundary; claim-evidence validator; abstention. |
| Self-approval | Designer/checker separation; role-based approval; no agent can approve its own R3/R4 action. |
| Duplicate documents/actions | Unique project/source document identity, idempotency keys, optimistic concurrency. |
| Event loss/retry storm | Durable journal, retries, dead-letter, budget and maximum attempts. |
| Malicious tool command | Sandbox command allow/deny policy, network restrictions, timeout/resource budget. |
| Update destroys user state | Backup, atomic overlay, preserved env/Git/data, rollback report. |
| Tampered release | SHA-256 file manifest, ZIP integrity, release certificate, source PDF checksum. |

## Residual risks
Independent penetration test, dependency vulnerability scanning, production row-level database policy, provider data-retention verification, and organizational incident response remain mandatory before public production.
