export const QUANTITY_TAKEOFF_SKILL_MD = `---
name: "quantity-takeoff"
version: "1.0.0"
description: "Precise geometric quantity takeoff, structural volume calculations, and rebar tonnage estimation"
scope: "system"
trust: "trusted"
trigger: "explicit"
allowed_tools: ["analyze_drawing", "query_materials"]
allowed_scopes: ["construction:takeoff"]
pinned: true
---

# Quantity Takeoff (QTO) Skill

This skill calculates exact material quantities and work volumes from engineering designs.

## Capabilities
1. **Concrete Volume**: Compute m3 volumes for footings, columns, beams, and slabs.
2. **Formwork Area**: Compute m2 contact surface area for bekisting.
3. **Rebar Weight**: Compute steel reinforcement weight (kg) from bar bending schedules and diameter tables.
`.trim();
