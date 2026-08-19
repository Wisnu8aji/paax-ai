export const RAB_SKILL_MD = `---
name: "rab"
version: "1.0.0"
description: "Rencana Anggaran Biaya (RAB) construction estimating and AHSP price analysis"
scope: "system"
trust: "trusted"
trigger: "explicit"
allowed_tools: ["lookup_ahsp", "query_rab", "export_rab_xlsx"]
allowed_scopes: ["construction:rab"]
pinned: true
---

# Rencana Anggaran Biaya (RAB) Estimator Skill

This skill provides domain expertise for Indonesian construction cost estimation (RAB) using SNI AHSP standards.

## Capabilities
1. **AHSP Analysis**: Lookup labor, material, and equipment coefficients based on SNI standards.
2. **Cost Estimation**: Calculate unit price and volume multiplication with high precision.
3. **Exporting**: Generate audit-ready Excel exports (.xlsx).

## Guidelines
- Always verify AHSP coefficients using \`lookup_ahsp\` before finalizing budget totals.
- Distinguish between Direct Costs (Biaya Langsung) and Overhead/Profit (Biaya Tidak Langsung).
- Adhere strictly to exact integer ID and price rounding rules.
`.trim();
