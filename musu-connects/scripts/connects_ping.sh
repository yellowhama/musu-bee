#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ROLE="${1:-}"
SERVER_TAILNET_IP="${SERVER_TAILNET_IP:-100.121.211.106}"
CLIENT_TAILNET_IP="${CLIENT_TAILNET_IP:-100.126.67.88}"
SERVER_PORT="${SERVER_PORT:-9443}"
COUNT="${COUNT:-20}"
PAYLOAD_BYTES="${PAYLOAD_BYTES:-32}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/mus-1482}"
mkdir -p "$OUT_DIR"

usage() {
  cat <<USAGE
Usage:
  scripts/connects_ping.sh server
  scripts/connects_ping.sh client

Environment overrides:
  SERVER_TAILNET_IP   default: 100.121.211.106
  CLIENT_TAILNET_IP   default: 100.126.67.88
  SERVER_PORT         default: 9443
  COUNT               default: 20
  PAYLOAD_BYTES       default: 32
  OUT_DIR             default: ./artifacts/mus-1482

Expected split-host run:
  5070Ti (server): SERVER_TAILNET_IP=100.121.211.106 scripts/connects_ping.sh server
  4060Ti (client): CLIENT_TAILNET_IP=100.126.67.88 SERVER_TAILNET_IP=100.121.211.106 scripts/connects_ping.sh client
USAGE
}

if [[ -z "$ROLE" || "$ROLE" == "-h" || "$ROLE" == "--help" ]]; then
  usage
  exit 0
fi

case "$ROLE" in
  server)
    BIND_ADDR="${BIND_ADDR:-${SERVER_TAILNET_IP}:${SERVER_PORT}}"
    PROOF_JSON="${PROOF_JSON:-$OUT_DIR/server-proof.json}"
    echo "[server] bind=${BIND_ADDR} proof=${PROOF_JSON} max_pings=${COUNT}"
    cargo run -p musu-connectsd -- tailscale-quic-server \
      --bind "$BIND_ADDR" \
      --proof-json "$PROOF_JSON" \
      --max-pings "$COUNT"
    ;;
  client)
    BIND_ADDR="${BIND_ADDR:-${CLIENT_TAILNET_IP}:0}"
    SERVER_ADDR="${SERVER_ADDR:-${SERVER_TAILNET_IP}:${SERVER_PORT}}"
    PROOF_JSON="${PROOF_JSON:-$OUT_DIR/client-proof.json}"
    echo "[client] bind=${BIND_ADDR} server=${SERVER_ADDR} proof=${PROOF_JSON} count=${COUNT} payload_bytes=${PAYLOAD_BYTES}"
    cargo run -p musu-connectsd -- tailscale-quic-client \
      --bind "$BIND_ADDR" \
      --server "$SERVER_ADDR" \
      --proof-json "$PROOF_JSON" \
      --count "$COUNT" \
      --payload-bytes "$PAYLOAD_BYTES"

    if command -v jq >/dev/null 2>&1; then
      echo "[client] latency summary"
      jq '{sample_count, latencyP50Ms, latencyP95Ms, p95Le200ms}' "$PROOF_JSON"
    fi
    ;;
  *)
    echo "unknown role: $ROLE" >&2
    usage
    exit 2
    ;;
esac
