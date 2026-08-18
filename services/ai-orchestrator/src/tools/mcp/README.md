# PAAX MCP client boundary

This package is a strict, lazy MCP client boundary. It is not an import or a
runtime claim that the Hermes `optional-skills/mcp` package is installed in
PAAX. The Phase 9 package-by-package disposition is in
`docs/ai-map/PHASE_9_SKILL_LEDGER.tsv`.

## Configuration and protocol

`parseMcpServers` / `loadMcpConfig` keep MCP disabled when
`PAAX_MCP_SERVERS` is absent. Servers require an exact stdio command or an
HTTP host/redirect allowlist, bounded timeout/frame/body limits, and reject
credential-shaped environment variables and headers without echoing values.

`createMcpClient` selects the bounded stdio or HTTP client. Stdio uses fixed
arguments and `shell: false`; both transports validate bounded JSON-RPC
initialize/list/call boundaries, propagate aborts, and do no work at module
import. HTTP redirects are handled explicitly and rechecked against the
allowlist.

## Adapter and policy

`adaptMcpTools` / `createMcpToolSource` return ordinary `ToolDefinition` values.
Names are normalized as `mcp__<serverId>__<toolName>`, schemas and collisions
fail closed, provenance is retained, and results are bounded. MCP tools default
to external/high-risk/approval-always; only an exact `readOnlyTools` allowlist
can lower a tool to read-only. The definitions enter the one canonical registry
and use its provider conversion, tool executor, journal, approval, WorkEvent,
and environment path.

The source is app-scoped when `createApp` receives configured MCP servers. The
agent discovers tools per turn and closes the source on discovery/preparation
failure and after execution; app shutdown also calls `close`. This gives
fail-closed cleanup, but Phase 9 did not prove safe reuse, concurrency, or
idempotent close semantics across overlapping turns. That lifecycle gap is
`G-MCP-01`; this document does not upgrade the implementation to a pool.

## Public API and non-goals

The supported boundary is `@paax/ai-orchestrator/tools` and re-exports the MCP
types, config helpers, client factories, adapter helpers, and source factory.
It is not an MCP server, proxy, OAuth flow, marketplace, remote package
installer, or persistent session pool. `mcp_catalog` is a display boundary and
does not create a second client or registry.

## Evidence

The Phase 9 service runner recorded PASS for:

- `tests/tools/mcp-config.test.ts`: disabled-by-default behavior, exact command
  and host allowlists, duplicate/unknown/credential rejection.
- `tests/tools/mcp-client.test.ts`: bounded stdio initialize/list/call and close,
  malformed/oversized/timeout rejection, and bounded HTTP JSON-RPC.
- `tests/tools/mcp-adapter.test.ts`: names/provenance, schema and collision
  rejection, canonical registry/provider conversion, approval/journal routing,
  and disabled-server behavior.

These tests prove the PAAX boundary and cleanup paths; they do not prove parity
with every Hermes MCP skill, server, or marketplace workflow.
