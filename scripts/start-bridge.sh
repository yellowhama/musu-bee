#!/usr/bin/env bash
# Start musu-bridge with correct PYTHONPATH
# Supports: token file (~/.musu/bridge_token), MUSU_DEV=1 auto-token, port conflict check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ── 토큰 해결 (우선순위: 환경변수 > 파일 > dev 자동생성) ────────
TOKEN_FILE="${MUSU_BRIDGE_TOKEN_FILE:-${HOME}/.musu/bridge_token}"

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" && -f "$TOKEN_FILE" ]]; then
    export MUSU_BRIDGE_TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"
fi

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" && "${MUSU_DEV:-}" == "1" ]]; then
    export MUSU_BRIDGE_TOKEN="dev-$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | head -c 32)"
    echo "[WARN] MUSU_BRIDGE_TOKEN auto-generated for dev mode. NOT for production." >&2
fi

# ── 포트 충돌 감지 ────────────────────────────────────────────
BRIDGE_PORT="${BRIDGE_PORT:-8070}"
if command -v ss &>/dev/null; then
    if ss -ltn 2>/dev/null | grep -q ":${BRIDGE_PORT} "; then
        # health check 먼저 — 이미 musu-bridge가 뜬 경우 재시작 불필요
        if curl -sf --max-time 1 "http://127.0.0.1:${BRIDGE_PORT}/health" >/dev/null 2>&1; then
            echo "[musu-bridge] already running on :${BRIDGE_PORT}" >&2
            exit 0
        fi
        echo "[ERROR] port ${BRIDGE_PORT} is in use by another process." >&2
        echo "  Stop it or set BRIDGE_PORT to a different port." >&2
        exit 1
    fi
fi

# ── PYTHONPATH 설정 + 실행 ────────────────────────────────────
export PYTHONPATH="${ROOT}/musu-core/src:${ROOT}/musu-bridge:${PYTHONPATH:-}"

cd "${ROOT}/musu-bridge"
exec python3 server.py "$@"
