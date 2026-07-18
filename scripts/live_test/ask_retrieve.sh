#!/bin/bash
# ask_retrieve.sh — Query project-graph/retrieve endpoint
#
# Usage:
#   bash scripts/live_test/ask_retrieve.sh "posisi kolom K1"
#   bash scripts/live_test/ask_retrieve.sh "balok lintel ada di lantai mana saja"
#   bash scripts/live_test/ask_retrieve.sh "berapa volume beton kolom lantai 2"
#
# Prerequisites:
#   - serve_db_with_fixture.py running di :8001

set -e

if [ $# -ne 1 ]; then
    echo "Usage: $0 '<query>'"
    exit 1
fi

QUERY="$1"
PROJECT_ID="PLHUT-SURAKARTA"
ENDPOINT="http://127.0.0.1:8001/projects/${PROJECT_ID}/project-graph/retrieve"

echo "Querying: ${ENDPOINT}"
echo "Query: ${QUERY}"
echo ""

curl -s \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Internal-Key: live-test-key" \
    -H "X-User-Id: OWNER-A" \
    -d "{\"query\": \"${QUERY}\", \"use_intent\": true}" \
    "${ENDPOINT}" \
    | python3 -m json.tool

echo ""
echo "Done."
