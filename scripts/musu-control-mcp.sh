#!/bin/bash
# MUSU Control MCP Server — connects to musu-bridge (localhost:8070)
export MUSU_BRIDGE_URL="http://127.0.0.1:8070"
export MUSU_BRIDGE_TOKEN="$(cat ~/.musu/bridge_token 2>/dev/null)"

# Auto-detect company ID from bridge.
# Priority: env var (set by adapter) > agent lookup > first company fallback.
if [ -z "$PAPERCLIP_COMPANY_ID" ] && [ -n "$MUSU_AGENT_ID" ]; then
  # Resolve company from agent's company_id field
  export PAPERCLIP_COMPANY_ID="$(curl -sf "http://127.0.0.1:8070/api/agents/$MUSU_AGENT_ID" 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("company_id",""))' 2>/dev/null)"
fi
if [ -z "$PAPERCLIP_COMPANY_ID" ]; then
  # Final fallback: first company in the registry
  export PAPERCLIP_COMPANY_ID="$(curl -sf http://127.0.0.1:8070/api/companies 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")' 2>/dev/null)"
fi

ROOT="${MUSU_FUNCTIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
exec "${ROOT}/musu-control/.venv/bin/musu-control" "$@"
