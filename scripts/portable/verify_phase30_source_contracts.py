from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKS: list[tuple[str, bool, str]] = []


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def check(name: str, condition: bool, detail: str) -> None:
    CHECKS.append((name, condition, detail))


bootstrap = text("scripts/live_test/serve_db_with_fixture.py")
check("bootstrap_non_destructive", ".unlink(" not in bootstrap, "portable bootstrap must never delete its database")
check("bootstrap_persistent_db", "paax-portable.db" in bootstrap, "persistent DB filename")
check("bootstrap_project_manifest", "project-manifest.json" in bootstrap, "manifest-driven idempotent seed")

start = text("scripts/portable/Start-PLHUT-Local.ps1")
check("shared_actor_startup", 'PAAX_PORTABLE_ACTOR_ID="paax-web"' in start, "all services inherit one actor")
check("runtime_secret_generated", "internal-service.key" in start and "NewGuid" in start, "secret generated locally")

for path in [
    "apps/web/src/app/api/db-projects/[...path]/route.ts",
    "apps/web/src/app/api/drawing-intelligence/[...path]/route.ts",
    "apps/web/src/app/api/document-intelligence/[...path]/route.ts",
    "apps/web/src/app/api/core-engine/[...path]/route.ts",
    "apps/web/src/app/api/command-room/chat/context.ts",
]:
    check(f"actor_binding::{path}", "PAAX_PORTABLE_ACTOR_ID" in text(path), path)

chat_route = text("apps/web/src/app/api/command-room/chat/route.ts")
check("command_room_project_scope", "projectId" in chat_route, "chat route receives project binding")
context = text("apps/web/src/app/api/command-room/chat/context.ts")
check("authoritative_context_first", "engineering-context" in context and "quantity_authority" in context, "verified facts precede raw graph")

store = text("apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx")
check("civil_projection", "CivilWorkItem" in store or "civilWorkItems" in store, "civil work items feed quantities")
canvas = text("apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx")
real_pos = canvas.find("realImageUrl ? <RealPageSvg")
svg_pos = canvas.find(": sheet ? <SheetPlanSvg")
check("real_pdf_layer_priority", real_pos >= 0 and svg_pos >= 0 and real_pos < svg_pos, "real source image branch precedes synthetic fallback")
quantities = text("apps/web/src/components/drawing-intelligence/workspace/dock/quantities-mode.tsx")
for header in ["Item pekerjaan", "Lokasi / Lantai", "Satuan", "Ukuran", "Jumlah", "Formula", "Volume / Hasil", "Sumber"]:
    check(f"quantity_header::{header}", header in quantities, header)
check("no_user_internal_code_column", ">Code<" not in quantities and ">Kode<" not in quantities, "technical code is not a primary user column")
check("excel_backup_action", "civilWorkItemsExportUrl" in quantities and "Perhitungan Excel" in quantities, "user can download calculation backup")

agentic_root = ROOT / "services/ai-orchestrator/src/agentic"
for file_name in ["types.ts", "project-binding.ts", "goal-planner.ts", "state-machine.ts", "tool-contract.ts"]:
    check(f"agentic::{file_name}", (agentic_root / file_name).exists(), file_name)
state = text("services/ai-orchestrator/src/agentic/state-machine.ts")
check("agentic_replan", "replanRun" in state, "persistent plan evolution")
check("agentic_terminal_guard", "terminal" in state.lower(), "terminal-state protection")
tools = text("services/ai-orchestrator/src/agentic/tool-contract.ts")
check("tool_timeout", "timeout" in tools.lower(), "bounded tool execution")
check("tool_project_scope", "project" in tools.lower() and "scope" in tools.lower(), "project-scoped tools")
check("tool_approval", "approval" in tools.lower(), "approval gate for side effects")

manifest = json.loads(text("fixtures/plhut/project-manifest.json"))
items = json.loads(text("fixtures/plhut/civil-work-items.json"))
check("plhut_manifest", manifest.get("project_id") == "PLHUT-SURAKARTA", "canonical project ID")
check("plhut_pdf_88", manifest.get("source_document", {}).get("page_count") == 88, "88-page source document")
check("civil_items_8", len(items.get("items", [])) == 8, "professional quantity projection")

failures = [entry for entry in CHECKS if not entry[1]]
report = {
    "schema_version": "paax.phase30.source-contracts.v1",
    "passed": len(CHECKS) - len(failures),
    "failed": len(failures),
    "checks": [{"name": n, "passed": ok, "detail": d} for n, ok, d in CHECKS],
}
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if failures else 0)
