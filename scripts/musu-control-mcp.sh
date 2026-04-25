#!/bin/bash
# MUSU Control MCP Server — connects to musu-bridge (localhost:8070)
export MUSU_BRIDGE_URL="http://127.0.0.1:8070"
export MUSU_BRIDGE_TOKEN="$(cat ~/.musu/bridge_token 2>/dev/null)"

# Auto-detect company ID from bridge
if [ -z "$PAPERCLIP_COMPANY_ID" ]; then
  export PAPERCLIP_COMPANY_ID="$(curl -sf http://127.0.0.1:8070/api/companies 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")' 2>/dev/null)"
fi

exec /home/hugh51/musu-functions/musu-control/.venv/bin/musu-control "$@"
