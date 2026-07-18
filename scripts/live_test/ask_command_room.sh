#!/bin/bash
# ask_command_room.sh — Query Command Room chat endpoint (SSE streaming)
#
# Prerequisites & Usage:
#   Terminal 1:
#     PYTHONUTF8=1 python scripts/live_test/serve_db_with_fixture.py
#
#   Terminal 2 (from apps/web):
#     pnpm dev
#   (with env vars: DB_API_URL=http://127.0.0.1:8001 INTERNAL_SERVICE_KEY=live-test-key COMMAND_ROOM_TOOLS_ENABLED=1)
#
#   Terminal 3:
#     bash scripts/live_test/ask_command_room.sh "pertanyaan Anda di sini"
#
# Examples:
#   bash scripts/live_test/ask_command_room.sh "posisi kolom K1"
#   bash scripts/live_test/ask_command_room.sh "balok lintel ada di lantai mana saja"
#   bash scripts/live_test/ask_command_room.sh "berapa volume beton kolom lantai 2"
#
# Output: SSE stream mentah ke stdout (setiap baris prefixed "data: " adalah chunk JSON)

set -e

if [ $# -ne 1 ]; then
    echo "Usage: $0 '<pertanyaan>'"
    exit 1
fi

QUESTION="$1"
PROJECT_ID="PLHUT-SURAKARTA"
ENDPOINT="http://localhost:3000/api/command-room/chat"

# Schema request (dari apps/web/src/app/api/command-room/chat/route.ts §39-75):
#   - messages: array of {role, content} — WAJIB min 1 item
#   - modelAlias: "lucent" | "arete" | "noir"
#   - reasoningEffort: "low" | "medium" | "high" | "max" (default: "high")
#   - thinking: "on" | "off" (default: "off")
#   - projectId: string (opsional, tapi recommended utk tool-calling)
#   - runId, conversationId: opsional (tracking)

echo "Querying: ${ENDPOINT}"
echo "Project: ${PROJECT_ID}"
echo "Model: lucent (DeepSeek V4 Pro)"
echo "Question: ${QUESTION}"
echo ""
echo "Streaming SSE response (Ctrl+C to stop):"
echo "─────────────────────────────────────────"
echo ""

curl -N \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{
        \"projectId\": \"${PROJECT_ID}\",
        \"messages\": [
            {
                \"role\": \"user\",
                \"content\": \"${QUESTION}\"
            }
        ],
        \"modelAlias\": \"lucent\",
        \"reasoningEffort\": \"high\",
        \"thinking\": \"off\"
    }" \
    "${ENDPOINT}"

echo ""
echo ""
echo "─────────────────────────────────────────"
echo "Stream ended."
