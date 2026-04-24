#!/usr/bin/env bash
# relay-stability-test.sh — 24-hour relay stability proof
#
# Usage: ./scripts/relay-stability-test.sh [relay_url]
# Default relay: http://localhost:9900

set -euo pipefail

RELAY_URL="${1:-http://localhost:9900}"
LOG_FILE="/tmp/relay-stability-$(date +%Y%m%d).log"
INTERVAL=300  # 5 minutes
DURATION=86400  # 24 hours

echo "=== MUSU Relay Stability Test ==="
echo "Relay: $RELAY_URL"
echo "Interval: ${INTERVAL}s"
echo "Duration: ${DURATION}s (24h)"
echo "Log: $LOG_FILE"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "================================="
echo ""

start_time=$(date +%s)
checks=0
failures=0

while true; do
    elapsed=$(( $(date +%s) - start_time ))
    if [ "$elapsed" -ge "$DURATION" ]; then
        break
    fi

    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    checks=$((checks + 1))

    # Check /health
    health=$(curl -s -m 10 "$RELAY_URL/health" 2>/dev/null || echo '{"error":"unreachable"}')
    tunnels=$(echo "$health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tunnels',[])))" 2>/dev/null || echo "0")

    # Check /metrics
    metrics=$(curl -s -m 10 "$RELAY_URL/metrics" 2>/dev/null || echo '{"error":"unreachable"}')
    uptime=$(echo "$metrics" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uptime_seconds',0))" 2>/dev/null || echo "0")
    reconnects=$(echo "$metrics" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reconnections_total',0))" 2>/dev/null || echo "?")

    status="ok"
    if [ "$tunnels" = "0" ] || echo "$health" | grep -q "error"; then
        status="FAIL"
        failures=$((failures + 1))
    fi

    line="$ts check=$checks status=$status tunnels=$tunnels uptime=${uptime}s reconnects=$reconnects"
    echo "$line"
    echo "$line" >> "$LOG_FILE"

    sleep "$INTERVAL"
done

echo ""
echo "=== Results ==="
echo "Total checks: $checks"
echo "Failures: $failures"
echo "Success rate: $(( (checks - failures) * 100 / checks ))%"
echo "Log: $LOG_FILE"
