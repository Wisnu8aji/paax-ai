import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = "C:\\Users\\ajiwi\\Downloads\\hermes-agent-main-arsitektur-file-catalog-bahasa-indonesia.md";
const lines = fs.readFileSync(catalogPath, "utf8").split(/\r?\n/u);
const start82 = lines.findIndex((line) => line.startsWith("### 8.2"));
const start83 = lines.findIndex((line) => line.startsWith("### 8.3"));
const start9 = lines.findIndex((line, index) => index > start83 && line.startsWith("## 9."));

function splitRow(line) {
  const cells = [];
  let current = "";
  for (let index = 1; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && line[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|" && index === line.length - 1) {
      cells.push(current.trim());
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  return cells;
}

function clean(value) {
  return String(value ?? "")
    .replace(/\r|\n|\t/gu, " ")
    .replace(/^`|`$/gu, "")
    .replace(/\|/gu, "¦")
    .replace(/\s+/gu, " ")
    .trim();
}

function tableRows(section, from, to, expected) {
  return lines.slice(from, to).flatMap((line, index) => {
    if (!line.startsWith("| `")) return [];
    let cells = splitRow(line);
    if (cells.length > expected) cells = cells.slice(0, expected - 1).concat([cells.slice(expected - 1).join(" | ")]);
    if (cells.length !== expected) throw new Error(`Malformed ${section} row at catalog line ${from + index + 1}: ${cells.length} cells`);
    return [{ section, lineNo: from + index + 1, cells }];
  });
}

const testRows = tableRows("8.2", start82 + 4, start83, 5).map(({ lineNo, cells }, index) => ({
  rowNo: index + 1, lineNo, path: clean(cells[0]).replaceAll("\\", "/"), category: clean(cells[3]), symbol: clean(cells[4]),
}));
const skillRows = tableRows("8.3", start83 + 5, start9, 6).map(({ lineNo, cells }, index) => ({
  rowNo: index + 1, lineNo, path: clean(cells[0]).replaceAll("\\", "/"), category: clean(cells[3]), title: clean(cells[4]), description: clean(cells[5]),
}));
if (testRows.length !== 2749 || skillRows.length !== 1847) throw new Error(`Catalog count mismatch: ${testRows.length}/${skillRows.length}`);

const evidence = {
  "E-SKILL-FORMAT": ["src/skills/format.ts::parseSkillDocument", "tests/skills/format.test.ts", "parses the narrow metadata contract and keeps body separate; rejects duplicate/unknown/unsafe fields, malformed lists, executable directives, and size violations"],
  "E-SKILL-LOADER": ["src/skills/loader.ts::FileSkillLoader/createSkillLoader; src/skills/types.ts::SkillLoader", "tests/skills/loader.test.ts", "lists bounded metadata then views body by safe name; rejects traversal, missing roots, duplicates, and oversized bodies"],
  "E-SKILL-GUARD": ["src/tools/skills-guard.ts::guardSkillAccess", "tests/tools/skills-guard.test.ts", "requires project/actor scope intersection and returns bounded capability intersection"],
  "E-SKILL-TOOLS": ["src/tools/skills-tool.ts::createSkillsTools; src/tools/skill-manager-tool.ts::createSkillManagerTool", "tests/tools/skills-tool.test.ts; tests/tools/skill-manager-tool.test.ts", "bounded read-only definitions, manual fallback without mutation port, and explicit injected mutation policy"],
  "E-MCP-CONFIG": ["src/tools/mcp/config.ts::parseMcpServers/loadMcpConfig", "tests/tools/mcp-config.test.ts", "disabled configuration, exact command/host allowlists, duplicate/unknown/credential rejection"],
  "E-MCP-CLIENT": ["src/tools/mcp/client.ts::createMcpClient", "tests/tools/mcp-client.test.ts", "bounded stdio initialize/list/call/close, malformed/oversized/timeout rejection, bounded HTTP JSON-RPC"],
  "E-MCP-ADAPTER": ["src/tools/mcp/adapter.ts::adaptMcpTools/createMcpToolSource", "tests/tools/mcp-adapter.test.ts", "names/provenance, schema/collision rejection, registry/provider conversion, approval/journal routing, disabled server"],
  "E-REGISTRY": ["src/tools/registry.ts::createToolRegistry; src/tools/model-tools.ts; src/tools/toolsets.ts", "tests/tools/canonical-registry.test.ts; tests/tools/model-tools.test.ts; tests/tools/toolsets.test.ts", "canonical composition, provider-neutral schemas, conservative policy, and one-registry filtering"],
  "E-GATEWAY-RUN": ["src/gateway/run.ts::GatewayRunner/createGatewayRouter", "tests/gateway/run.test.ts", "profile/binding validation, safe endpoint errors, durable run/message receipt, WorkEvent persistence and replay"],
  "E-GATEWAY-SESSION": ["src/gateway/session.ts::session stores", "tests/gateway/session.test.ts", "deterministic identity, binding checks, durable reopen, metadata identity rules"],
  "E-GATEWAY-STREAM": ["src/gateway/stream-consumer.ts::WorkEventStreamConsumer", "tests/gateway/stream-consumer.test.ts", "sequence preservation/deduplication, failure/overflow, abort/close, replay cursor"],
  "E-GATEWAY-EVENTS": ["src/gateway/work-events.ts; packages/schemas/src/command-room-worker.ts::GatewayWorkEventSchema", "tests/gateway/work-events.test.ts; tests/state/work-events.test.ts", "shared envelope/sequence/SSE framing, redaction/bounds, append-before-delivery and replay"],
  "E-JOURNAL": ["src/state/turn-journal.ts::DurableTurnJournal", "tests/state/turn-journal.test.ts", "queued invocation reopen and terminal transition rules"],
  "E-CRON": ["src/cron/host.ts; src/cron/scheduler.ts; src/cron/durable-store.ts", "tests/cron/host.test.ts; tests/cron/scheduler.test.ts; tests/cron/jobs.test.ts; tests/cron/durable-store.test.ts", "explicit tick, due-once dispatch, durable claim/completion receipt, lease recovery, disabled lifecycle"],
  "E-RUNTIME": ["src/agent/runtime.ts; src/agent/conversation-loop.ts; src/agent/turn-finalizer.ts", "tests/agent/runtime.test.ts; tests/agent/runtime-phase3.test.ts; tests/agent/conversation-loop.test.ts; tests/agent/iteration-budget.test.ts; tests/agent/turn-finalizer.test.ts", "canonical loop, profile/tool scope, bounded iterations/tokens/duration, final envelope"],
  "E-CONTEXT": ["src/agent/context-engine.ts; src/agent/context-compressor.ts; src/agent/prompt-builder.ts; src/agent/context-files.ts", "tests/agent/context-engine.test.ts; tests/agent/context-compressor.test.ts; tests/agent/context-files.test.ts; tests/agent/prompt-builder.test.ts", "bounded scoped context, deterministic compression fallback, provenance, stable/context/volatile prompt layers"],
  "E-APPROVAL": ["src/agent/approval-service.ts; src/gateway/run.ts::approval resolve", "tests/agent/approval.test.ts; tests/agent/approval-service.test.ts; tests/agent/tool-executor.test.ts", "binding/role/argument/replay rejection and no rejected side effect"],
  "E-TOOL-EXEC": ["src/agent/tool-executor.ts; src/agent/tool-guardrails.ts", "tests/agent/tool-executor.test.ts; tests/agent/tool-guardrails.test.ts", "structured malformed-call errors, journal-before-side-effect, sequential side effects, threat denial"],
  "E-SUBAGENT": ["src/agent/subagent-lifecycle.ts; src/agent/subagent-integration.ts", "tests/agent/subagent-lifecycle.test.ts; tests/agent/subagent-integration.test.ts", "recursion/binding/capability guard, idempotency replay, bounded child lineage"],
  "E-STATE": ["src/state/session-db.ts; src/state/work-events.ts", "tests/state/session-db.test.ts; tests/state/schema.test.ts; tests/state/search.test.ts; tests/state/work-events.test.ts", "durable reopen, idempotency/conflict rejection, scoped search, WorkEvents before delivery"],
  "E-PLUGIN": ["src/plugins/manager.ts; src/plugins/middleware.ts", "tests/plugins/manager.test.ts; tests/plugins/middleware.test.ts", "manifest/root validation, allowlisted lifecycle, collision isolation, immutable authority"],
  "E-OBS": ["src/observability/audit.ts; src/observability/trace.ts; src/observability/metrics.ts", "tests/observability/audit.test.ts; tests/observability/trace.test.ts; tests/observability/metrics.test.ts", "bounded redacted audit, sanitized spans, capped metric cardinality"],
  "E-PROVIDER": ["src/provider/base.ts; src/provider/transports/*; src/config.ts", "current provider transport/profile tests in the service runner", "current OpenAI-compatible/provider invariants; legacy Gemini symbols excluded"],
};

function adapted(id, forcedGap = "") {
  const [source, file, symbol] = evidence[id];
  let gap = forcedGap;
  if (!gap && id.startsWith("E-MCP-")) gap = "G-MCP-01/MEDIUM";
  if (!gap && id === "E-SKILL-TOOLS") gap = "G-SKILL-01/MEDIUM";
  if (!gap && id === "E-SUBAGENT") gap = "G-SUBAGENT-01/HIGH";
  if (!gap && id === "E-CRON") gap = "G-CRON-01/HIGH";
  if (!gap && id === "E-OBS") gap = "G-AUDIT-01/MEDIUM";
  return { mapping: "ADAPTED", execution: "PASS", source, file, symbol, evidence: id, gap: gap || "—", disposition: gap ? `adapted:${id}; gap:${gap.split("/")[0]}` : `adapted:${id}` };
}
const absent = (gap) => ({ mapping: "ABSENT", execution: "NOT-RUN", source: "—", file: "—", symbol: "—", evidence: "NO-CURRENT-PAAX-EVIDENCE", gap, disposition: `gap:${gap.split("/")[0]}` });
const out = () => ({ mapping: "OUT-OF-SCOPE", execution: "NOT-RUN", source: "—", file: "—", symbol: "—", evidence: "SCOPE-EXCLUDED", gap: "—", disposition: "out-of-scope" });
const frozen = () => ({ mapping: "FROZEN", execution: "NOT-RUN", source: "—", file: "—", symbol: "—", evidence: "LEGACY-FROZEN", gap: "—", disposition: "frozen-legacy-not-current-evidence" });

function classifyTest(row) {
  const p = row.path.toLowerCase();
  if (/(gemini|genkit|firebase|search_knowledge|legacy)/u.test(`${p} ${row.symbol.toLowerCase()}`)) return frozen();
  const excluded = ["tests-js/", "tests/website/", "tests/acp", "tests/tui_gateway", "tests/desktop/", "tests/platform/", "tests/relay/", "ui-tui/", "website/"];
  if (excluded.some((prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`))) return out();
  const skillPath = p.includes("/skills/") || p.startsWith("tests/skills/") || /test_(skill|skills)(_|\.|\/)/u.test(p) || p.includes("skill_manager");
  if (skillPath) {
    if (/(format|frontmatter|metadata|directive|parse)/u.test(p)) return adapted("E-SKILL-FORMAT");
    if (/(loader|discov|list|view|root|traversal|symlink|provenance|duplicate)/u.test(p)) return adapted("E-SKILL-LOADER");
    if (/(guard|trust|scope|capabil)/u.test(p)) return adapted("E-SKILL-GUARD");
    if (/(tool|manager|mutation|edit)/u.test(p)) return adapted("E-SKILL-TOOLS");
    return absent("G-SKILL-COVERAGE-01/MEDIUM");
  }
  const mcpPath = p.includes("/mcp/") || /(^|\/)test_mcp/u.test(p) || p.includes("_mcp_");
  if (mcpPath) {
    if (/(config|allowlist|credential|secret)/u.test(p)) return adapted("E-MCP-CONFIG");
    if (/(client|json-rpc|stdio|http|frame|timeout)/u.test(p)) return adapted("E-MCP-CLIENT");
    if (/(adapter|discov|provenance|collision|tool)/u.test(p)) return adapted("E-MCP-ADAPTER");
    if (/(registry|schema|provider)/u.test(p)) return adapted("E-REGISTRY");
    return absent("G-MCP-COVERAGE-01/MEDIUM");
  }
  if (p.startsWith("tests/gateway/") || p.includes("/gateway/")) {
    if (/(stream|sse|delivery|overflow|replay)/u.test(p)) return adapted("E-GATEWAY-STREAM", /(replay|cursor)/u.test(p) ? "G-REPLAY-01/MEDIUM" : "");
    if (/(event|work-event)/u.test(p)) return adapted("E-GATEWAY-EVENTS", /(reasoning|delta)/u.test(p) ? "G-REASONING-01/MEDIUM" : "");
    if (/(session|binding)/u.test(p)) return adapted("E-GATEWAY-SESSION");
    if (/(run|route|turn|approval)/u.test(p)) return /approval/u.test(p) ? adapted("E-APPROVAL") : adapted("E-GATEWAY-RUN");
    return absent("G-GATEWAY-COVERAGE-01/MEDIUM");
  }
  if (p.startsWith("tests/cron/") || p.includes("/cron/")) return adapted("E-CRON");
  if (p.startsWith("tests/plugins/") || p.includes("/plugins/")) return adapted("E-PLUGIN");
  if (p.startsWith("tests/observability/") || p.includes("/observability/")) return adapted("E-OBS");
  if (p.startsWith("tests/state/") || p.includes("/state/")) {
    if (/(work-event|event)/u.test(p)) return adapted("E-GATEWAY-EVENTS");
    if (/journal/u.test(p)) return adapted("E-JOURNAL", "G-JOURNAL-01/HIGH");
    return adapted("E-STATE");
  }
  if (p.startsWith("tests/agent/") || p.includes("/agent/")) {
    if (/approval/u.test(p)) return adapted("E-APPROVAL");
    if (/(subagent|delegate|child)/u.test(p)) return adapted("E-SUBAGENT");
    if (/(test_(context_engine|context_compressor|context_files|prompt_builder|turn_context|memory_manager)|test_(context|prompt|memory)(_|\.)|test_(?!auxiliary_).*compression)/u.test(p) && !p.includes("coding_context")) return adapted("E-CONTEXT");
    if (/(test_(tool_executor|tool_guardrails|tool_guard|threat|sandbox)|tool-executor|tool-guardrail)/u.test(p) && !p.includes("file_safety")) return adapted("E-TOOL-EXEC");
    if (/(test_(provider|transport)|provider|transport)/u.test(p) && !p.includes("auxiliary")) return adapted("E-PROVIDER");
    if (/(test_(runtime|conversation_loop|iteration_budget|turn_state|turn_finalizer|monitoring|loop_hooks|system_prompt)|runtime-phase)/u.test(p)) return adapted("E-RUNTIME");
    return absent("G-AGENT-COVERAGE-01/MEDIUM");
  }
  if (p.startsWith("tests/tools/") || p.includes("/tools/")) {
    if (/approval/u.test(p)) return adapted("E-APPROVAL");
    if (/(registry|model-tools|toolsets|toolset)/u.test(p)) return adapted("E-REGISTRY");
    if (/(delegate|subagent)/u.test(p)) return adapted("E-SUBAGENT");
    if (/(threat|sandbox|terminal|guard|tool)/u.test(p)) return adapted("E-TOOL-EXEC");
    return absent("G-TOOLS-COVERAGE-01/MEDIUM");
  }
  if (p.startsWith("tests/providers/") || p.includes("/providers/")) return /(openai|responses|opencode|deepseek|transport)/u.test(p) ? adapted("E-PROVIDER") : out();
  return out();
}

const testHeader = ["section", "catalog_path", "catalog_row_anchor", "catalog_category", "hermes_test_symbol", "paax_source_symbol", "paax_test_file", "paax_test_symbol", "mapping_status", "execution_status", "exact_evidence", "gap_severity", "disposition"];
const testLines = [testHeader.join("\t")];
const testStats = {};
for (const row of testRows) {
  const result = classifyTest(row);
  testStats[result.mapping] = (testStats[result.mapping] ?? 0) + 1;
  testLines.push(["8.2", row.path, `R${row.rowNo}@L${row.lineNo}`, row.category, row.symbol || "∅", result.source, result.file, result.symbol, result.mapping, result.execution, result.evidence, result.gap, result.disposition].map(clean).join("\t"));
}

function roleForSkill(pathName) {
  const value = pathName.toLowerCase();
  if (value.endsWith("/skill.md") || value === "skill.md") return "skill-manifest";
  if (value.endsWith("/description.md")) return "package-description";
  if (value.endsWith("/readme.md")) return "package-doc";
  if (value.includes("/references/")) return "reference-content";
  if (value.includes("/templates/")) return "template-content";
  if (value.includes("/assets/")) return "asset-content";
  if (value.includes("/scripts/")) return "helper-script";
  if (value.includes("/prompts/")) return "prompt-content";
  if (value.includes("/examples/")) return "example-content";
  return "package-content";
}
function skillDisposition(row) {
  const p = row.path.toLowerCase();
  const category = row.category.toLowerCase();
  const role = roleForSkill(row.path);
  const intent = row.title + (row.description ? ` — ${row.description}` : "");
  const isSkill = p.startsWith("skills/") || p.startsWith("optional-skills/") || category.includes("skills");
  if (isSkill) {
    const isMcp = p.includes("/mcp/") || category.includes("mcp");
    const runtimeBearing = ["skill-manifest", "package-description", "package-doc", "helper-script", "package-content"].includes(role);
    if (isMcp && runtimeBearing) return { role, intent, api: "@paax/ai-orchestrator/tools; src/tools/mcp/config.ts; src/tools/mcp/client.ts; src/tools/mcp/adapter.ts", relation: "MCP_CONFIG/MCP_CLIENT/MCP_ADAPTER; NO_PACKAGE_INSTALL", mapping: "ABSENT", docs: "CURRENT", test: "PAAX-BOUNDARY:E-MCP-CONFIG,E-MCP-CLIENT,E-MCP-ADAPTER; HERMES:NOT-RUN", security: "Hermes MCP package/server is not installed or executed; credential-shaped config is rejected/redacted", disposition: "gap:G-MCP-PACKAGE" };
    if (!isMcp && runtimeBearing) return { role, intent, api: "@paax/ai-orchestrator/tools; src/skills/format.ts; src/skills/loader.ts; src/skills/types.ts; src/tools/skills-guard.ts", relation: "SKILL_FORMAT/SKILL_LOADER/SKILL_GUARD; NO_EXEC", mapping: "ABSENT", docs: "CURRENT", test: "PAAX-BOUNDARY:E-SKILL-FORMAT,E-SKILL-LOADER,E-SKILL-GUARD; HERMES:NOT-RUN", security: "Hermes package content is not imported, installed, or executed; PAAX treats skill text as untrusted data", disposition: "gap:G-SKILL-PACKAGE" };
    return { role, intent, api: "—", relation: "NO_RUNTIME_HANDLER; NO_EXEC", mapping: "OUT-OF-SCOPE", docs: "NOT-APPLICABLE", test: "NOT-RUN", security: "Progressive-disclosure/content row only; PAAX does not execute it", disposition: "out-of-scope:content-only" };
  }
  if (category.includes("tools/registry/toolsets")) return { role: "toolset-content", intent, api: "@paax/ai-orchestrator/tools; src/tools/registry.ts; src/tools/toolsets.ts", relation: "CANONICAL_REGISTRY; PROVIDER_CONVERSION; NO_SECOND_REGISTRY", mapping: "ADAPTED", docs: "CURRENT", test: "PAAX:E-REGISTRY/PASS", security: "Provider-neutral schema and canonical collision/policy checks remain authoritative", disposition: "adapted:E-REGISTRY" };
  return { role: "non-skill-documentation", intent, api: "—", relation: "NOT-A-PAAX-SKILL-PACKAGE", mapping: "OUT-OF-SCOPE", docs: "NOT-APPLICABLE", test: "NOT-RUN", security: "No PAAX worker package is imported from this row", disposition: "out-of-scope:phase-9-skill-package" };
}

const skillHeader = ["catalog_path", "row_anchor", "package_role", "hermes_intent", "paax_package_source_api", "loader_guard_mcp_relation", "mapping_status", "documentation_status", "test_evidence", "security_provenance_note", "disposition"];
const skillLines = [skillHeader.join("\t")];
const skillStats = {};
const documentationStats = {};
for (const row of skillRows) {
  const result = skillDisposition(row);
  skillStats[result.mapping] = (skillStats[result.mapping] ?? 0) + 1;
  documentationStats[result.docs] = (documentationStats[result.docs] ?? 0) + 1;
  skillLines.push([row.path, `R${row.rowNo}@L${row.lineNo}`, result.role, result.intent.slice(0, 420), result.api, result.relation, result.mapping, result.docs, result.test, result.security, result.disposition].map(clean).join("\t"));
}

fs.writeFileSync(path.join(root, "docs/ai-map/PHASE_9_TEST_LEDGER.tsv"), `${testLines.join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(root, "docs/ai-map/PHASE_9_SKILL_LEDGER.tsv"), `${skillLines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ rows82: testRows.length, rows83: skillRows.length, populated82: testRows.filter((row) => row.symbol).length, testStats, skillStats, documentationStats }));
