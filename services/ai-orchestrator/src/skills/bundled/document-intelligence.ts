export const DOCUMENT_INTELLIGENCE_SKILL_MD = `---
name: "document-intelligence"
version: "1.0.0"
description: "Construction contract analysis, technical specification parsing, and OCR document extraction"
scope: "system"
trust: "trusted"
trigger: "explicit"
allowed_tools: ["file_read", "file_search"]
allowed_scopes: ["construction:documents"]
pinned: true
---

# Document Intelligence Skill

This skill extracts structured entities, clauses, and technical parameters from tender documents, contracts, and RKS.

## Capabilities
1. **Clause Extraction**: Locate liquidated damages, defect liability periods, and payment milestones.
2. **Technical Specifications**: Match material standards (e.g., Mutu Beton f'c 25 MPa, Besi Ulir BjTS 420B).
3. **Addendum Tracking**: Audit amendments, change orders (CCO), and time extensions.
`.trim();
