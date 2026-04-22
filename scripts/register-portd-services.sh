#!/usr/bin/env bash
# Register MUSU services with portd (wiki/003 — all services must register)
# Run after services start. Idempotent — safe to re-run.
PORTD="${MUSU_PORTD_URL:-http://127.0.0.1:1355}"

register() {
    local sig="$1" alias="$2"
    result=$(curl -s -X POST "$PORTD/promote" \
        -H "Content-Type: application/json" \
        -d "{\"signature\":\"$sig\",\"alias\":\"$alias\"}" 2>&1)
    if echo "$result" | grep -q "alias"; then
        echo "[portd] ✓ $alias registered"
    else
        echo "[portd] ⚠ $alias: $result"
    fi
}

# Auto-detect and register known MUSU services
register "tcp|python3|0.0.0.0|8070" "bridge"
register "tcp|forgejo|*|3000" "forgejo"
register "tcp|python|127.0.0.1|9700" "worker"
register "tcp|musu-connectsd|0.0.0.0|4433" "connectsd"

echo "[portd] Done. Routes:"
curl -s "$PORTD/routes" 2>/dev/null | python3 -c "
import sys, json
try:
    for r in json.load(sys.stdin):
        print(f'  {r.get(\"alias\",\"?\"):15s} → port {r.get(\"port\",\"?\")}')
except: print('  (none)')
" 2>/dev/null
