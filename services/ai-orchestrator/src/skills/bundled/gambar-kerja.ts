export const GAMBAR_KERJA_SKILL_MD = `---
name: "gambar-kerja"
version: "1.0.0"
description: "Architectural and structural engineering drawing inspection and quantity takeoff cross-referencing"
scope: "system"
trust: "trusted"
trigger: "explicit"
allowed_tools: ["analyze_drawing", "query_project_graph"]
allowed_scopes: ["construction:drawings"]
pinned: true
---

# Gambar Kerja (Engineering Drawings) Inspector Skill

This skill inspects architectural, structural, and MEP engineering drawings.

## Capabilities
1. **Dimension Verification**: Check grid axes, section labels, and scale notations.
2. **Structural Element Identification**: Locate footings, columns (Kolom Utama/Praktis), beams (Balok), and slabs.
3. **Spec Alignment**: Cross-verify drawing annotations with project bill of quantities (BQ) and technical specifications (RKS).
`.trim();
