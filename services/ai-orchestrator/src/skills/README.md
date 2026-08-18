# PAAX skills boundary

This is the PAAX runtime contract for bounded skill content. It is not a claim
that the Hermes catalog under `skills/` or `optional-skills/` is shipped as a
PAAX package. Phase 9 records that catalog separately in
`docs/ai-map/PHASE_9_SKILL_LEDGER.tsv`.

## Format and loader

`parseSkillDocument` accepts only the narrow metadata contract:
`name`, `version`, `description`, `scope`, `trust`, `trigger`, `allowed_tools`,
`allowed_scopes`, and `pinned`. Unknown, duplicate, unsafe, malformed, or
over-limit fields are rejected. Metadata and body are bounded independently.

`createSkillLoader` / `FileSkillLoader` take explicit absolute roots. Discovery
is metadata-first: `SkillLoader.list()` returns bounded summaries and
provenance, while `SkillLoader.view()` reads one bounded body by safe name.
Traversal, symlink escape, duplicate names, missing roots, and oversized content
are rejected. Provenance includes the root, relative path, SHA-256, and byte
count.

## Access and tools

`guardSkillAccess` requires an actor, project binding, scope intersection, and a
non-quarantined skill. Trusted capability is granted only when the metadata is
trusted and pinned. Skill text remains untrusted data and is never an authority
for permissions or engineering numbers.

`createSkillsTools` exposes only bounded read-only `skills_list` and `skill_view`
operations. `createSkillManagerTool` is a high-risk mutation boundary: it is
not usable without an injected `SkillMutationPort`, validates the actor and
scope, rejects executable directives, and remains subject to canonical tool
policy and approval. Both boundaries return a manual fallback on failure.

The package never executes skill text. There is no script, hook, package
installation, tool call, or second agent loop in this boundary.

## Public package surface and composition status

The supported import boundary is `@paax/ai-orchestrator/tools`. It currently
exports the skill loader, parser, tool factories, `SkillLoader`,
`SkillMetadata`, `SkillActorContext`, `SkillMutationPort`, and
`SkillSummary`. `SkillFormatError`, `SkillLoadError`, `guardSkillAccess`, and
several detailed result/input types remain internal implementation symbols; a
consumer must not infer them from a wildcard internal import. This public API
gap is registered as `G-API-01` in the Phase 9 receipt.

`createToolRegistry` accepts an explicit `skills` option and can append the
skill tools. The default `createApp` composition currently constructs the
canonical registry without that option and does not inject a skill provider.
Therefore this README documents the available boundary, not an assertion that
skills are enabled in every default app instance. Wiring is an intentionally
separate follow-up finding (`G-SKILL-01`); no production code is changed by
Phase 9.

## Evidence

The service runner evidence is the Phase 9 run of 90 files / 351 tests:

- `tests/skills/format.test.ts`: narrow metadata/body separation, unsafe-field
  rejection, executable-directive rejection, and size limits.
- `tests/skills/loader.test.ts`: progressive list/view behavior plus traversal,
  missing-root, duplicate, and body-size rejection.
- `tests/tools/skills-guard.test.ts`: actor/project/scope intersection and
  bounded capability intersection.
- `tests/tools/skills-tool.test.ts`: bounded read-only list/view definitions.
- `tests/tools/skill-manager-tool.test.ts`: manual fallback without a mutation
  port and explicit injected mutation policy.

Those tests prove the PAAX boundary invariants only; they do not establish
Hermes package parity or automatic skill execution.
