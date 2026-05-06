#!/usr/bin/env bash
# Start musu-bridge with correct PYTHONPATH
# Supports: token file (~/.musu/bridge_token), MUSU_DEV=1 auto-token, port conflict check
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ── Early .env loading (Priority 1-C) ────────────────────────────────────────
# Load musu-bridge/.env FIRST, before any other logic
# Relay env vars (MUSU_RELAY_ENABLED, MUSU_RELAY_URL) auto-injected
# Priority: shell env > musu-bridge/.env (shell env wins if already set)
if [[ -f "${ROOT}/musu-bridge/.env" ]]; then
    set -a
    source "${ROOT}/musu-bridge/.env"
    set +a
    echo "[start-bridge] ✅ musu-bridge/.env loaded (relay env vars auto-injected)" >&2
fi

# ── Prerequisites guard ───────────────────────────────────────
if [[ ! -d "${HOME}/.musu" ]]; then
    echo "[ERROR] ~/.musu directory not found." >&2
    echo "  Run setup first: bash ${SCRIPT_DIR}/install.sh" >&2
    exit 1
fi
if [[ ! -x "${ROOT}/musu-bridge/.venv/bin/python3" ]]; then
    echo "[WARN] musu-bridge/.venv not found — falling back to system python3 (may fail)" >&2
    echo "  Run: bash ${SCRIPT_DIR}/install.sh" >&2
fi

# ── Optional dependencies: auto-install screen tools if missing ──────────────
_apt_install_screen_deps() {
    local missing=()
    command -v x11vnc  &>/dev/null || missing+=("x11vnc")
    command -v Xvfb    &>/dev/null || missing+=("xvfb")
    command -v xdpyinfo &>/dev/null || missing+=("x11-utils")
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "[start-bridge] installing screen deps: ${missing[*]}" >&2
        sudo apt-get install -y -q "${missing[@]}" >&2 \
            && echo "[start-bridge] ✅ screen deps installed: ${missing[*]}" >&2 \
            || echo "[start-bridge] WARN: screen deps install failed (VNC feature may not work)" >&2
    fi
}

if ! command -v x11vnc &>/dev/null || ! command -v Xvfb &>/dev/null; then
    if command -v apt-get &>/dev/null; then
        _apt_install_screen_deps
    elif command -v brew &>/dev/null; then
        # macOS: only x11vnc available via brew; Xvfb not applicable
        command -v x11vnc &>/dev/null || \
            brew install x11vnc >&2 && echo "[start-bridge] ✅ x11vnc installed" >&2 \
            || echo "[start-bridge] WARN: x11vnc install failed (Screen feature may not work)" >&2
    else
        echo "[start-bridge] WARN: x11vnc/Xvfb not found and no package manager available." >&2
        echo "  Install manually: sudo apt install x11vnc xvfb x11-utils" >&2
    fi
fi

# ── Optional: User config override (~/.musu/bridge.env) ──────────────────────
# Load user-specific overrides AFTER project defaults (shell env still wins)
if [[ -f "${HOME}/.musu/bridge.env" ]]; then
    set -a
    source "${HOME}/.musu/bridge.env"
    set +a
    echo "[start-bridge] ~/.musu/bridge.env loaded (user overrides)" >&2
fi

# ── Bridge token resolution (priority: env > file > dev auto-generate) ────────
TOKEN_FILE="${MUSU_BRIDGE_TOKEN_FILE:-${HOME}/.musu/bridge_token}"

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" && -f "$TOKEN_FILE" ]]; then
    export MUSU_BRIDGE_TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"
fi

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" && "${MUSU_DEV:-}" == "1" ]]; then
    export MUSU_BRIDGE_TOKEN="dev-$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | head -c 32)"
    echo "[WARN] MUSU_BRIDGE_TOKEN auto-generated for dev mode. NOT for production." >&2
fi

# ── MUSU_TOKEN resolution (musu.pro peer discovery) ──────────────────────────
MUSU_TOKEN_FILE="${HOME}/.musu/musu_token"
MUSU_PRO_URL="${MUSU_PRO_URL:-https://musu.pro}"
DEVICE_API="${MUSU_PRO_URL}/api/v1/auth/device"
NODE_NAME="${MUSU_NODE_NAME:-$(hostname)}"

if [[ -z "${MUSU_TOKEN:-}" && -f "$MUSU_TOKEN_FILE" ]]; then
    export MUSU_TOKEN="$(tr -d '\n' < "$MUSU_TOKEN_FILE")"
    echo "[start-bridge] MUSU_TOKEN loaded — peer discovery enabled" >&2
fi

# ── Device auth: auto-register with musu.pro if no token ─────────────────────
# IMPORTANT: runs in BACKGROUND so bridge starts immediately.
# Token is saved to file; bridge picks it up on next restart.
if [[ -z "${MUSU_TOKEN:-}" && "${MUSU_DEV:-}" != "1" ]] && command -v curl &>/dev/null && command -v jq &>/dev/null; then
    echo "[start-bridge] MUSU_TOKEN not set — device auth will run in background" >&2

    # Background subshell: request device code, poll for approval, save token
    (
        RESP=$(curl -sf --max-time 5 \
            -X POST "${DEVICE_API}" \
            -H "Content-Type: application/json" \
            -d "{\"node_name\":\"${NODE_NAME}\"}" 2>/dev/null || echo "")

        if [[ -z "$RESP" ]]; then
            echo "[start-bridge/bg] musu.pro connection failed — no peer discovery" >&2
            exit 0
        fi

        DEVICE_CODE=$(echo "$RESP" | jq -r '.device_code // empty' 2>/dev/null)
        VERIFY_URI=$(echo "$RESP"  | jq -r '.verification_uri // empty' 2>/dev/null)

        if [[ -z "$DEVICE_CODE" || -z "$VERIFY_URI" ]]; then
            echo "[start-bridge/bg] musu.pro response error — no peer discovery" >&2
            exit 0
        fi

        echo "" >&2
        echo "  ┌─────────────────────────────────────────────────────┐" >&2
        echo "  │  🐝  musu-bridge: device approval needed            │" >&2
        echo "  │                                                      │" >&2
        echo "  │  Open this URL in your browser and click Approve:   │" >&2
        echo "  │  ${VERIFY_URI}" >&2
        echo "  │                                                      │" >&2
        echo "  │  Bridge is running. Token saved on approval.        │" >&2
        echo "  └─────────────────────────────────────────────────────┘" >&2

        # Auto-open browser (WSL2 → Windows browser, Linux → xdg-open, macOS → open)
        if grep -qi "microsoft" /proc/version 2>/dev/null; then
            cmd.exe /c start "" "$VERIFY_URI" 2>/dev/null &
        elif command -v xdg-open &>/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
            xdg-open "$VERIFY_URI" 2>/dev/null &
        elif command -v open &>/dev/null; then
            open "$VERIFY_URI" 2>/dev/null &
        fi

        # Poll every 5s, up to 15 min (180 attempts)
        for _i in $(seq 1 180); do
            sleep 5
            POLL_OUT=$(curl -s -w "\n%{http_code}" --max-time 5 \
                "${DEVICE_API}?device_code=${DEVICE_CODE}" 2>/dev/null || printf "\n000")
            HTTP_STATUS=$(printf '%s' "$POLL_OUT" | tail -1)
            POLL_RESP=$(printf '%s' "$POLL_OUT" | head -n -1)

            if [[ "$HTTP_STATUS" == "200" ]]; then
                TOKEN=$(echo "$POLL_RESP" | jq -r '.token // empty' 2>/dev/null)
                if [[ -n "$TOKEN" ]]; then
                    mkdir -p "${HOME}/.musu" && chmod 700 "${HOME}/.musu"
                    echo "$TOKEN" > "$MUSU_TOKEN_FILE"
                    chmod 600 "$MUSU_TOKEN_FILE"
                    echo "[start-bridge/bg] ✅ token saved → ${MUSU_TOKEN_FILE}" >&2
                    echo "[start-bridge/bg] Restart bridge to enable peer discovery." >&2
                    exit 0
                fi
            elif [[ "$HTTP_STATUS" == "410" ]]; then
                echo "[start-bridge/bg] device code expired" >&2
                exit 0
            fi
        done
        echo "[start-bridge/bg] approval timeout — restart to try again" >&2
    ) &
    # Background PID — will be cleaned up when bridge process exits
    echo "[start-bridge] device auth polling in background (PID $!)" >&2
fi

# ── machine_group: group nodes on the same physical machine ──────────────────
# Priority: env var > WSL2 auto-detect > hostname
if [[ -z "${MUSU_MACHINE_GROUP:-}" ]]; then
    if grep -qi "microsoft" /proc/version 2>/dev/null; then
        # WSL2: use Windows hostname as group ID (WSL2 hostname == Windows hostname)
        WIN_HOSTNAME="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')"
        export MUSU_MACHINE_GROUP="${WIN_HOSTNAME}"
        echo "[start-bridge] WSL2 detected — machine_group: ${WIN_HOSTNAME}" >&2
    else
        # Linux/macOS: use own hostname as group ID
        export MUSU_MACHINE_GROUP="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')"
    fi
fi

# ── Wake-on-LAN: auto-detect MAC address ─────────────────────────────────────
if [[ -z "${MUSU_MAC_ADDRESS:-}" ]]; then
    if command -v ip &>/dev/null; then
        _WOL_MAC="$(ip link show 2>/dev/null | grep -A1 'state UP' | grep 'link/ether' | awk '{print $2}' | head -1)"
        _WOL_BCAST="$(ip route 2>/dev/null | grep 'src' | grep -v '169.254' | awk '/src/{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1)}}' | head -1)"
        if [[ -n "$_WOL_MAC" ]]; then
            export MUSU_MAC_ADDRESS="$_WOL_MAC"
            # Derive broadcast: replace last octet with 255
            if [[ -n "$_WOL_BCAST" ]]; then
                export MUSU_BROADCAST_IP="$(echo "$_WOL_BCAST" | sed 's/\.[0-9]*$/.255/')"
            else
                export MUSU_BROADCAST_IP="255.255.255.255"
            fi
            echo "[start-bridge] WoL MAC: ${MUSU_MAC_ADDRESS} broadcast: ${MUSU_BROADCAST_IP}" >&2
        else
            echo "[start-bridge] WARN: MAC address detection failed — WoL disabled. Manual override: export MUSU_MAC_ADDRESS=xx:xx:xx:xx:xx:xx" >&2
        fi
    fi
fi

# ── Port conflict detection ───────────────────────────────────────────────────
BRIDGE_PORT="${BRIDGE_PORT:-8070}"
_OLD_PID=$(lsof -ti:${BRIDGE_PORT} 2>/dev/null | head -1)
if [ -n "$_OLD_PID" ]; then
    echo "[start-bridge] killing orphan on :${BRIDGE_PORT} (PID $_OLD_PID)" >&2
    kill "$_OLD_PID" 2>/dev/null; sleep 1
    kill -9 "$_OLD_PID" 2>/dev/null || true
    # Wait for port to actually free (max 10s)
    for _i in $(seq 1 10); do
        lsof -ti:${BRIDGE_PORT} >/dev/null 2>&1 || break
        sleep 1
    done
fi

# ── musu-connectsd bridge-proxy (QUIC sidecar) ────────────────────────────────
# bin/ first (pre-built), fall back to target/release/
if [[ -f "${ROOT}/bin/musu-connectsd" ]]; then
    CONNECTSD_BIN="${ROOT}/bin/musu-connectsd"
else
    CONNECTSD_BIN="${ROOT}/musu-connects/target/release/musu-connectsd"
fi
QUIC_PID=""

# If musu-connectsd is already managed by systemd, skip manual launch
HTTP_PROXY_PORT="${MUSU_HTTP_PROXY_PORT:-9443}"
if systemctl --user is-active musu-connectsd.service &>/dev/null; then
    echo "[start-bridge] musu-connectsd managed by systemd — skipping manual start" >&2
    export MUSU_QUIC_PROXY_URL="http://127.0.0.1:${HTTP_PROXY_PORT}"
elif [[ -f "$CONNECTSD_BIN" ]]; then
    QUIC_PORT="${MUSU_QUIC_PORT:-4433}"
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

# Cleanup: kill QUIC sidecar on exit (only if we launched it manually)
if [[ -n "$QUIC_PID" ]]; then
    trap "kill $QUIC_PID 2>/dev/null || true" EXIT INT TERM
fi

# ── QUIC fingerprint export ───────────────────────────────────────────────────
# Compute fingerprint from cert before Python starts → read via os.getenv()
QUIC_CERT="${HOME}/.musu/quic_cert.der"
if [[ -f "$QUIC_CERT" ]] && command -v openssl &>/dev/null; then
    if command -v xxd &>/dev/null; then
        COMPUTED_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | xxd -p | tr -d '\n' | sed 's/../&:/g;s/:$//')"
    else
        # Fall back to od if xxd is missing (BusyBox environments)
        COMPUTED_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | od -A n -t x1 | tr -d ' \n' | sed 's/../&:/g;s/:$//')"
    fi
    export MUSU_QUIC_FINGERPRINT="$COMPUTED_FP"
    echo "[start-bridge] QUIC fingerprint: ${COMPUTED_FP:0:23}..." >&2
else
    echo "[start-bridge] WARN: quic_cert.der not found — fingerprint not set (start bridge once to generate cert)" >&2
fi

# ── Pre-start: mark stale running executions as failed ────────────────────────
# Prevents durability re-dispatch from spawning claude subprocesses on startup,
# which can D-state (disk sleep) and block the bridge from binding its port.
MUSU_DB="${HOME}/.musu/musu.db"
if [[ -f "$MUSU_DB" ]] && command -v sqlite3 &>/dev/null; then
    STALE=$(sqlite3 "$MUSU_DB" "SELECT count(*) FROM route_executions WHERE status='running';" 2>/dev/null || echo "0")
    if [[ "$STALE" -gt 0 ]]; then
        sqlite3 "$MUSU_DB" "UPDATE route_executions SET status='failed', error='stale: bridge restarted' WHERE status='running';" 2>/dev/null
        echo "[start-bridge] cleaned $STALE stale running execution(s)" >&2
    fi
fi

# ── Set PYTHONPATH and exec ───────────────────────────────────────────────────
export PYTHONPATH="${ROOT}/musu-core/src:${ROOT}/musu-bridge:${PYTHONPATH:-}"

# Prefer root .venv (works when deps installed at repo root, e.g. main-pc).
# Fall back to bridge-specific .venv, then system python3.
if [[ -x "${ROOT}/.venv/bin/python3" ]]; then
    PYTHON="${ROOT}/.venv/bin/python3"
elif [[ -x "${ROOT}/musu-bridge/.venv/bin/python3" ]]; then
    PYTHON="${ROOT}/musu-bridge/.venv/bin/python3"
else
    PYTHON="python3"
fi

cd "${ROOT}/musu-bridge"

# ── Persistent log file (date-rotated) ───────────────────────────────────────
LOG_DIR="${ROOT}/logs"
mkdir -p "${LOG_DIR}"
LOG_DATE="$(date +%Y%m%d)"
LOG_FILE="${LOG_DIR}/bridge-${LOG_DATE}.log"
echo "[start-bridge] logging to ${LOG_FILE}" >&2

# ── Start worker alongside bridge (single command = everything runs) ──────────
WORKER_PORT="${MUSU_WORKER_PORT:-9700}"
WORKER_BIN="${ROOT}/musu-bridge/.venv/bin/musu-worker"
if [[ -x "$WORKER_BIN" ]]; then
    echo "[start-bridge] starting musu-worker on port ${WORKER_PORT}" >&2
    "$WORKER_BIN" --port "${WORKER_PORT}" >> "${LOG_DIR}/musu-worker.log" 2>&1 &
    WORKER_PID=$!
    echo "[start-bridge] musu-worker PID=${WORKER_PID}" >&2
    # Kill worker when bridge exits
    trap "kill ${WORKER_PID} 2>/dev/null" EXIT
else
    echo "[start-bridge] WARN: musu-worker not found at ${WORKER_BIN} — remote exec disabled" >&2
fi

# Use uvicorn module to ensure all endpoints (including post-uvicorn.run() ones) load
exec "$PYTHON" -m uvicorn server:app --host "${MUSU_BRIDGE_HOST:-0.0.0.0}" --port "${BRIDGE_PORT:-8070}" "$@" >> "${LOG_FILE}" 2>&1
