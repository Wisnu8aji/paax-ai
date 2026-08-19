export const SCHEDULING_SKILL_MD = `---
name: "scheduling"
version: "1.0.0"
description: "Master construction schedule planning, Critical Path Method (CPM), and S-Curve tracking"
scope: "system"
trust: "trusted"
trigger: "explicit"
allowed_tools: ["query_schedule", "query_progress"]
allowed_scopes: ["construction:schedule"]
pinned: true
---

# Construction Scheduling & Kurva S Skill

This skill manages time schedules, milestone dependencies, and S-Curve progress tracking.

## Capabilities
1. **WBS Breakdown**: Create Work Breakdown Structures matching project phases.
2. **Critical Path Analysis**: Calculate Early Start, Early Finish, Late Start, and Total Float.
3. **S-Curve Generation**: Compute planned vs actual weight percentages (bobot pekerjaan) per week/month.
`.trim();
