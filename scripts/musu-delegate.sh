#!/usr/bin/env bash
# musu-delegate — delegate a task to a MUSU agent
# Usage: musu-delegate <channel> "<instruction>"
# Example: musu-delegate engineer "Fix the login bug"
set -euo pipefail

CHANNEL="${1:-}"
shift 2>/dev/null || true
INSTRUCTION="$*"

if [ -z "$CHANNEL" ] || [ -z "$INSTRUCTION" ]; then
    echo "Usage: musu-delegate <channel> \"<instruction>\""
    echo ""
    echo "Channels: ceo, cto, engineer, qa, team_lead, planner, cos"
    echo ""
    echo "Examples:"
    echo "  musu-delegate engineer \"Fix the login bug in auth.py\""
    echo "  musu-delegate cto \"Research React Server Components\""
    echo "  musu-delegate team_lead \"Distribute sprint tasks\""
    exit 1
fi

BRIDGE_URL="${MUSU_BRIDGE_URL:-http://localhost:8070}"
TOKEN=$(cat ~/.musu/bridge_token 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
    echo "Error: No bridge token found at ~/.musu/bridge_token"
    echo "Run: bash install.sh"
    exit 1
fi

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 300 \
    -X POST "${BRIDGE_URL}/api/tasks/delegate" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$CHANNEL\",\"text\":\"$INSTRUCTION\",\"sender_id\":\"cli\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "202" ]; then
    TASK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null || echo "")
    echo "Task delegated to '$CHANNEL'"
    [ -n "$TASK_ID" ] && echo "Task ID: $TASK_ID"
    echo "Poll: curl ${BRIDGE_URL}/api/tasks/${TASK_ID}"
else
    echo "Error (HTTP $HTTP_CODE):"
    echo "$BODY"
fi
