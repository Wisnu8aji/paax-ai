# PAAX Skills System (`paax-skills`)

The PAAX Skills System provides OpenAI Codex-compatible progressive disclosure skill loading, validation, management, and runtime injection.

## Architecture

```
services/ai-orchestrator/src/skills/
├── bundled/             # Core construction domain skills
│   ├── rab.ts           # Rencana Anggaran Biaya & AHSP
│   ├── gambar-kerja.ts  # Engineering drawings & takeoff cross-ref
│   ├── scheduling.ts    # CPM & S-Curve scheduling
│   ├── quantity-takeoff.ts # Concrete, rebar, bekisting volume calculations
│   └── document-intelligence.ts # Contract clauses & specs extraction
├── format.ts            # SKILL.md YAML frontmatter parser
├── loader.ts            # Safe filesystem skill loader with bounded buffers
├── skills-catalog.ts    # Search, filter, and index skills
├── skills-runtime.ts    # Progressive disclosure & context injection
├── skills-manager.ts    # Lifecycle management (create, update, delete)
├── skills-validator.ts  # Structural & security validation
└── types.ts             # Skill domain contracts
```

## Progressive Disclosure
Skills are not injected in bulk into the LLM context. Instead:
1. **Compact Index**: A lightweight list of available skills is exposed in the system prompt.
2. **On-Demand Activation**: The agent dynamically activates a skill via the `skills_tool` when relevant to the task.
3. **Full Instructions Injection**: The activated skill instructions are loaded and injected for targeted domain reasoning.

## Validation Rules
- Mandatory YAML frontmatter with delimiters `---`.
- Strict schema: `name`, `version`, `description`, `scope`, `trust`, `trigger`, `allowed_tools`, `allowed_scopes`, `pinned`.
- Rejection of executable script directives, shell commands, or unauthorized tool scopes.
- Bounded file size limits (16KB metadata, 128KB body).
