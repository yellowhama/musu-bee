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

# ── MUSU_TOKEN (musu.pro peer discovery) 해결 ────────────────
MUSU_TOKEN_FILE="${HOME}/.musu/musu_token"
MUSU_PRO_URL="${MUSU_PRO_URL:-https://musu.pro}"
DEVICE_API="${MUSU_PRO_URL}/api/v1/auth/device"
NODE_NAME="${MUSU_NODE_NAME:-$(hostname)}"

if [[ -z "${MUSU_TOKEN:-}" && -f "$MUSU_TOKEN_FILE" ]]; then
    export MUSU_TOKEN="$(tr -d '\n' < "$MUSU_TOKEN_FILE")"
    echo "[start-bridge] MUSU_TOKEN loaded — peer discovery enabled" >&2
fi

# ── Device auth: 토큰 없으면 musu.pro에서 자동 발급 ──────────
if [[ -z "${MUSU_TOKEN:-}" && "${MUSU_DEV:-}" != "1" ]] && command -v curl &>/dev/null && command -v jq &>/dev/null; then
    echo "[start-bridge] MUSU_TOKEN 없음 — musu.pro 자동 인증 시작..." >&2

    RESP=$(curl -sf --max-time 5 \
        -X POST "${DEVICE_API}" \
        -H "Content-Type: application/json" \
        -d "{\"node_name\":\"${NODE_NAME}\"}" 2>/dev/null || echo "")

    if [[ -n "$RESP" ]]; then
        DEVICE_CODE=$(echo "$RESP" | jq -r '.device_code // empty' 2>/dev/null)
        USER_CODE=$(echo "$RESP"   | jq -r '.user_code // empty'   2>/dev/null)
        VERIFY_URI=$(echo "$RESP"  | jq -r '.verification_uri // empty' 2>/dev/null)

        if [[ -n "$DEVICE_CODE" && -n "$VERIFY_URI" ]]; then
            echo "" >&2
            echo "  ┌─────────────────────────────────────────────────────┐" >&2
            echo "  │  🐝  musu-bridge 승인 필요                            │" >&2
            echo "  │                                                      │" >&2
            echo "  │  브라우저에서 아래 URL을 열어 '이 머신 승인' 클릭:       │" >&2
            echo "  │                                                      │" >&2
            echo "  │  ${VERIFY_URI}" >&2
            echo "  │                                                      │" >&2
            echo "  │  15분 내 승인하면 토큰이 자동 저장됩니다.              │" >&2
            echo "  └─────────────────────────────────────────────────────┘" >&2
            echo "" >&2

            # 브라우저 자동 오픈 (가능한 경우)
            if command -v xdg-open &>/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
                xdg-open "$VERIFY_URI" 2>/dev/null &
            elif command -v open &>/dev/null; then  # macOS
                open "$VERIFY_URI" 2>/dev/null &
            fi

            # 폴링: 5초 간격, 최대 15분 (180회)
            POLL_MAX=180
            POLL_COUNT=0
            while [[ $POLL_COUNT -lt $POLL_MAX ]]; do
                sleep 5
                POLL_COUNT=$((POLL_COUNT + 1))

                POLL_RESP=$(curl -sf --max-time 5 \
                    "${DEVICE_API}/token?device_code=${DEVICE_CODE}" 2>/dev/null || echo "")

                HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
                    "${DEVICE_API}/token?device_code=${DEVICE_CODE}" 2>/dev/null || echo "000")

                if [[ "$HTTP_STATUS" == "200" ]]; then
                    TOKEN=$(echo "$POLL_RESP" | jq -r '.token // empty' 2>/dev/null)
                    if [[ -n "$TOKEN" ]]; then
                        mkdir -p "${HOME}/.musu" && chmod 700 "${HOME}/.musu"
                        echo "$TOKEN" > "$MUSU_TOKEN_FILE"
                        chmod 600 "$MUSU_TOKEN_FILE"
                        export MUSU_TOKEN="$TOKEN"
                        echo "[start-bridge] ✅ 토큰 저장 완료 → ${MUSU_TOKEN_FILE}" >&2
                        echo "[start-bridge] peer discovery 활성화됨" >&2
                        break
                    fi
                elif [[ "$HTTP_STATUS" == "410" ]]; then
                    echo "[start-bridge] WARN: device code 만료 — peer discovery 없이 시작" >&2
                    break
                fi
                # 202 pending → 계속 폴링
            done

            if [[ -z "${MUSU_TOKEN:-}" ]]; then
                echo "[start-bridge] WARN: 승인 대기 시간 초과 — peer discovery 없이 시작" >&2
                echo "  다시 시작하면 새 코드가 발급됩니다." >&2
            fi
        else
            echo "[start-bridge] WARN: musu.pro 응답 오류 — peer discovery 없이 시작" >&2
        fi
    else
        echo "[start-bridge] WARN: musu.pro 연결 실패 — peer discovery 없이 시작" >&2
    fi
fi

# ── machine_group: 같은 물리 머신의 노드를 하나의 그룹으로 묶기 ──
# 우선순위: 환경변수 > WSL2 자동 감지 > 호스트명
if [[ -z "${MUSU_MACHINE_GROUP:-}" ]]; then
    if grep -qi "microsoft" /proc/version 2>/dev/null; then
        # WSL2 환경: Windows 호스트명을 group ID로 사용 (WSL2 hostname = Windows hostname)
        WIN_HOSTNAME="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')"
        export MUSU_MACHINE_GROUP="${WIN_HOSTNAME}"
        echo "[start-bridge] WSL2 감지 → machine_group: ${WIN_HOSTNAME}" >&2
    else
        # 일반 Linux/macOS: 자신의 호스트명을 group ID로 사용
        export MUSU_MACHINE_GROUP="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')"
    fi
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

# ── musu-connectsd bridge-proxy (QUIC sidecar) ────────────────
# bin/ 우선 (pre-built), 없으면 target/release/ 폴백
if [[ -f "${ROOT}/bin/musu-connectsd" ]]; then
    CONNECTSD_BIN="${ROOT}/bin/musu-connectsd"
else
    CONNECTSD_BIN="${ROOT}/musu-connects/target/release/musu-connectsd"
fi
QUIC_PID=""

if [[ -f "$CONNECTSD_BIN" ]]; then
    QUIC_PORT="${MUSU_QUIC_PORT:-4433}"
    HTTP_PROXY_PORT="${MUSU_HTTP_PROXY_PORT:-9443}"
    LOCAL_BRIDGE_URL="${MUSU_BRIDGE_URL:-http://127.0.0.1:${BRIDGE_PORT}}"

    mkdir -p "${ROOT}/logs"
    "$CONNECTSD_BIN" bridge-proxy \
        --quic-port "$QUIC_PORT" \
        --http-port "$HTTP_PROXY_PORT" \
        --bridge-url "$LOCAL_BRIDGE_URL" \
        >> "${ROOT}/logs/musu-connectsd.log" 2>&1 &
    QUIC_PID=$!

    sleep 1
    if kill -0 "$QUIC_PID" 2>/dev/null; then
        echo "[start-bridge] musu-connectsd bridge-proxy started (PID $QUIC_PID, QUIC :${QUIC_PORT}, HTTP :${HTTP_PROXY_PORT})" >&2
        export MUSU_QUIC_PROXY_URL="http://127.0.0.1:${HTTP_PROXY_PORT}"
    else
        echo "[start-bridge] WARN: musu-connectsd exited immediately — QUIC disabled. Check logs/musu-connectsd.log" >&2
        QUIC_PID=""
        export MUSU_QUIC_PROXY_URL=""
    fi
else
    echo "[start-bridge] musu-connectsd not found — QUIC disabled (HTTP-only mode)" >&2
    echo "  Build: cd musu-connects && cargo build --release -p musu-connectsd" >&2
    export MUSU_QUIC_PROXY_URL=""
fi

# Cleanup: kill QUIC sidecar on exit
if [[ -n "$QUIC_PID" ]]; then
    trap "kill $QUIC_PID 2>/dev/null || true" EXIT INT TERM
fi

# ── QUIC fingerprint export ────────────────────────────────────
# Python 시작 전에 cert 파일에서 fingerprint 계산 → os.getenv() 에서 읽힘
QUIC_CERT="${HOME}/.musu/quic_cert.der"
if [[ -f "$QUIC_CERT" ]] && command -v openssl &>/dev/null; then
    if command -v xxd &>/dev/null; then
        COMPUTED_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | xxd -p | tr -d '\n' | sed 's/../&:/g;s/:$//')"
    else
        # xxd 없으면 od 사용 (BusyBox 환경 대응)
        COMPUTED_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | od -A n -t x1 | tr -d ' \n' | sed 's/../&:/g;s/:$//')"
    fi
    export MUSU_QUIC_FINGERPRINT="$COMPUTED_FP"
    echo "[start-bridge] QUIC fingerprint: ${COMPUTED_FP:0:23}..." >&2
else
    echo "[start-bridge] WARN: quic_cert.der not found — fingerprint not set (start bridge once to generate cert)" >&2
fi

# ── PYTHONPATH 설정 + 실행 ────────────────────────────────────
export PYTHONPATH="${ROOT}/musu-core/src:${ROOT}/musu-bridge:${PYTHONPATH:-}"

# venv python 우선 사용 (musu-bridge/.venv/bin/python3)
PYTHON="${ROOT}/musu-bridge/.venv/bin/python3"
if [[ ! -x "$PYTHON" ]]; then
    PYTHON="python3"
fi

cd "${ROOT}/musu-bridge"
exec "$PYTHON" server.py "$@"
