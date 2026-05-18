#!/usr/bin/env bash
# musu-bridge installer
# Run once after git clone on a new machine — leaves bridge ready to start.
#
# Usage:
#   bash scripts/install.sh              # setup only (venv, ~/.musu, bridge.env)
#   bash scripts/install.sh --service    # + register systemd service
#   bash scripts/install.sh --start      # + start bridge immediately
#   bash scripts/install.sh --service --start
#
# Idempotent: already-installed steps are skipped. Safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
MUSU_HOME="${HOME}/.musu"
VENV="${ROOT}/musu-bridge/.venv"

# ── Flag parsing ─────────────────────────────────────────────────────────────
INSTALL_SERVICE=0
START_BRIDGE=0
INSTALL_HTTPS=0
for arg in "$@"; do
    case "$arg" in
        --service) INSTALL_SERVICE=1 ;;
        --start)   START_BRIDGE=1 ;;
        --https)   INSTALL_HTTPS=1 ;;
    esac
done

# ── Colored output helpers ───────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[install]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[install]${NC} ⚠ $*"; }
err()  { echo -e "${RED}[install]${NC} ✗ $*" >&2; exit 1; }
info() { echo -e "[install] $*"; }

echo ""
echo "[install] === musu-bridge install ==="
echo "[install]     repo: ${ROOT}"
echo "[install]     musu: ${MUSU_HOME}"
echo ""

# ── Step 1: Check Python3 ─────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    err "python3 not found. Install: sudo apt install python3 python3-venv python3-pip"
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "Step 1: Python ${PY_VERSION} found"

# ── Step 2: Create ~/.musu/ ───────────────────────────────────────────────────
if [[ ! -d "${MUSU_HOME}" ]]; then
    mkdir -p "${MUSU_HOME}"
    chmod 700 "${MUSU_HOME}"
    ok "~/.musu/ created"
else
    info "Step 2: ~/.musu/ already exists"
fi
mkdir -p "${MUSU_HOME}/db"

# ── Step 2b: Optional system packages (screen / VNC) ─────────────────────────
# Required for /api/screen/vnc/start on headless nodes (no physical X11 display)
if command -v apt-get &>/dev/null; then
    _screen_missing=()
    command -v x11vnc   &>/dev/null || _screen_missing+=("x11vnc")
    command -v Xvfb     &>/dev/null || _screen_missing+=("xvfb")
    command -v xdpyinfo &>/dev/null || _screen_missing+=("x11-utils")
    if [[ ${#_screen_missing[@]} -gt 0 ]]; then
        info "Step 2b: installing screen deps (${_screen_missing[*]})..."
        sudo apt-get install -y -q "${_screen_missing[@]}" >/dev/null \
            && ok "screen deps installed: ${_screen_missing[*]}" \
            || warn "screen deps install failed — VNC feature may not work on headless nodes"
    else
        info "Step 2b: screen deps already installed (x11vnc, Xvfb, xdpyinfo)"
    fi
else
    info "Step 2b: non-apt system — skipping screen dep auto-install (install x11vnc + xvfb manually)"
fi

# ── Step 3: Create venv + install deps ───────────────────────────────────────
if [[ ! -x "${VENV}/bin/python3" ]]; then
    info "Step 3: creating venv..."
    python3 -m venv "${VENV}"
    ok "venv created: ${VENV}"

    info "       installing musu-core..."
    "${VENV}/bin/pip" install --quiet -e "${ROOT}/musu-core/"
    ok "musu-core installed"

    info "       installing musu-bridge..."
    "${VENV}/bin/pip" install --quiet -e "${ROOT}/musu-bridge/"
    ok "musu-bridge installed"
else
    info "Step 3: venv already exists — skipping deps"
fi

# ── Step 4: Seed ~/.musu/bridge.env ──────────────────────────────────────────
BRIDGE_ENV="${MUSU_HOME}/bridge.env"
ENV_EXAMPLE="${SCRIPT_DIR}/systemd/bridge.env.example"

if [[ ! -f "${BRIDGE_ENV}" ]]; then
    info "Step 4: creating bridge.env..."
    cp "${ENV_EXAMPLE}" "${BRIDGE_ENV}"
    chmod 600 "${BRIDGE_ENV}"

    # Auto-generate MUSU_BRIDGE_TOKEN
    TOKEN="$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")"
    sed -i "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=${TOKEN}|" "${BRIDGE_ENV}"

    # Add BRIDGE_HOST=0.0.0.0 for remote access
    printf '\n# Remote access binding (added by install.sh)\nBRIDGE_HOST=0.0.0.0\n' >> "${BRIDGE_ENV}"

    ok "bridge.env created (token auto-generated)"
    warn "To enable musu.pro peer discovery, set MUSU_TOKEN in ${BRIDGE_ENV}"
else
    info "Step 4: bridge.env already exists — skipping"
    # Fill in token if empty
    if grep -q "^MUSU_BRIDGE_TOKEN=$" "${BRIDGE_ENV}" 2>/dev/null; then
        TOKEN="$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")"
        sed -i "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=${TOKEN}|" "${BRIDGE_ENV}"
        ok "MUSU_BRIDGE_TOKEN auto-generated"
    fi
fi

# ── Step 5: Init ~/.musu/nodes.toml (auto-detect GPU, OS, Tailscale) ─────────
NODES_TOML="${MUSU_HOME}/nodes.toml"
if [[ ! -f "${NODES_TOML}" ]]; then
    info "Step 5: detecting node identity..."
    # Use node_identity.py for auto-detection
    NODE_INFO=$("${VENV}/bin/python3" -c "
import sys; sys.path.insert(0, '${ROOT}/musu-bridge')
from node_identity import detect_node_identity
d = detect_node_identity()
print(d.get('hostname', ''))
print(d.get('os', 'linux'))
print(d.get('gpu', ''))
print(d.get('tailscale_ip', ''))
print(d.get('machine', ''))
" 2>/dev/null) || NODE_INFO=""

    NODE_NAME=$(echo "$NODE_INFO" | sed -n '1p')
    NODE_OS=$(echo "$NODE_INFO" | sed -n '2p')
    NODE_GPU=$(echo "$NODE_INFO" | sed -n '3p')
    NODE_TS_IP=$(echo "$NODE_INFO" | sed -n '4p')
    NODE_MACHINE=$(echo "$NODE_INFO" | sed -n '5p')
    [[ -z "$NODE_NAME" ]] && NODE_NAME="$(hostname)"

    cat > "${NODES_TOML}" << TOML_EOF

[mesh]
self = "${NODE_NAME}"
worker_port = 9700
health_interval_sec = 30

[[mesh.nodes]]
name = "${NODE_NAME}"
machine = "${NODE_MACHINE:-${NODE_NAME}-pc}"
os = "${NODE_OS:-linux}"
tailscale_ip = "${NODE_TS_IP}"
url = "http://${NODE_TS_IP:-127.0.0.1}:8070"
gpu = "${NODE_GPU}"
TOML_EOF
    ok "nodes.toml initialized (self=${NODE_NAME}, gpu=${NODE_GPU:-none}, ts=${NODE_TS_IP:-none})"
else
    info "Step 5: nodes.toml already exists — skipping"
fi

# ── Step 5b: Seed agents with auto-detected CLI ─────────────────────────────
info "Step 5b: seeding agents..."
"${VENV}/bin/python3" -c "
import sys, os
sys.path.insert(0, '${ROOT}/musu-bridge')
sys.path.insert(0, '${ROOT}/musu-core/src')
os.chdir('${ROOT}')
from seed_agents import seed
from musu_core.backends.local import LocalBackend
from musu_core.config import get_config
cfg = get_config()
db_path = cfg.db_path
from pathlib import Path
Path(db_path).parent.mkdir(parents=True, exist_ok=True)
backend = LocalBackend(db_path)
try:
    seed(backend)
finally:
    backend.close()
" 2>&1 | while IFS= read -r line; do echo "        $line"; done
ok "agents seeded with auto-detected CLI"

# ── Step 6: Build musu-bee ────────────────────────────────────────────────────
BEE_DIR="${ROOT}/musu-bee"
if [[ -d "${BEE_DIR}" && ! -d "${BEE_DIR}/.next" ]]; then
    info "Step 6: building musu-bee (first time)..."
    if command -v node &>/dev/null; then
        (
            cd "${BEE_DIR}"
            npm install --silent 2>/dev/null || true
            npm run build --silent 2>/dev/null || { warn "musu-bee build failed — UI unavailable"; exit 0; }
            ok "musu-bee build complete"
        )
    else
        warn "node not found — skipping musu-bee build. Install Node.js to use the UI."
    fi
else
    info "Step 6: musu-bee build already exists — skipping"
fi

# ── Step 7: Register service (--service) ─────────────────────────────────────
# Linux → systemd user unit. macOS → launchd LaunchAgent.
if [[ "${INSTALL_SERVICE}" == "1" ]]; then
    case "${OSTYPE:-linux-gnu}" in
        linux*|*-gnu*|msys*|cygwin*)
            info "Step 7: registering systemd user services..."
            bash "${SCRIPT_DIR}/install-musu-bridge-service.sh"

            SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
            mkdir -p "${SYSTEMD_USER_DIR}"
            ln -sf "${SCRIPT_DIR}/systemd/musu-bee.service" "${SYSTEMD_USER_DIR}/musu-bee.service"
            systemctl --user daemon-reload
            systemctl --user enable musu-bee 2>/dev/null || true
            ok "systemd services registered (bridge + bee)"
            ;;
        darwin*)
            info "Step 7: registering launchd LaunchAgent (macOS)..."
            LAUNCH_DIR="${HOME}/Library/LaunchAgents"
            mkdir -p "${LAUNCH_DIR}"
            mkdir -p "${MUSU_HOME}/logs"
            PLIST_SRC="${SCRIPT_DIR}/launchd/com.musu.bridge.plist.example"
            PLIST_DST="${LAUNCH_DIR}/com.musu.bridge.plist"

            # Substitute __MUSU_ROOT__ and __HOME__ in template
            sed -e "s|__MUSU_ROOT__|${ROOT}|g" \
                -e "s|__HOME__|${HOME}|g" \
                "${PLIST_SRC}" > "${PLIST_DST}"
            chmod 644 "${PLIST_DST}"

            # Reload — unload first in case re-installing
            launchctl unload "${PLIST_DST}" 2>/dev/null || true
            launchctl load "${PLIST_DST}"
            ok "launchd registered: com.musu.bridge"
            info "       (musu-bee not auto-started — run 'pnpm start' in musu-bee/)"
            ;;
        *)
            warn "Step 7: unknown OSTYPE='${OSTYPE}' — manual service registration required"
            warn "       Linux: bash ${SCRIPT_DIR}/install-musu-bridge-service.sh"
            warn "       macOS: see scripts/launchd/com.musu.bridge.plist.example"
            ;;
    esac
else
    info "Step 7: service registration skipped (no --service flag)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
ok "=== install complete ==="
echo ""
echo "  config:  ${BRIDGE_ENV}"
TOKEN_PREVIEW="$(grep '^MUSU_BRIDGE_TOKEN=' "${BRIDGE_ENV}" | cut -d= -f2 | cut -c1-16)"
echo "  token:   ${TOKEN_PREVIEW}..."
echo ""

if [[ "${START_BRIDGE}" == "0" ]]; then
    echo "  Start the bridge:"
    echo "    bash ${SCRIPT_DIR}/start-bridge.sh"
    if [[ "${INSTALL_SERVICE}" == "1" ]]; then
        case "${OSTYPE:-linux-gnu}" in
            darwin*) echo "    or:  launchctl load ~/Library/LaunchAgents/com.musu.bridge.plist" ;;
            *)       echo "    or:  systemctl --user start musu-bridge" ;;
        esac
    fi
    echo ""
fi

# ── Start bridge immediately (--start) ───────────────────────────────────────
if [[ "${START_BRIDGE}" == "1" ]]; then
    echo ""
    info "Starting bridge..."

    if [[ "${INSTALL_SERVICE}" == "1" ]]; then
        case "${OSTYPE:-linux-gnu}" in
            darwin*)
                # launchd already started bridge via RunAtLoad=true; just wait.
                info "  (launchd already started bridge via RunAtLoad)"
                sleep 3
                ;;
            *)
                systemctl --user start musu-bridge
                sleep 3
                ;;
        esac
    else
        mkdir -p "${ROOT}/logs"
        nohup bash "${SCRIPT_DIR}/start-bridge.sh" \
            > "${ROOT}/logs/bridge-install-start.log" 2>&1 &
        BRIDGE_PID=$!
        info "  PID: ${BRIDGE_PID}"
        sleep 4
    fi

    BRIDGE_PORT="${BRIDGE_PORT:-8070}"
    WORKER_PORT="${MUSU_WORKER_PORT:-9700}"
    if curl -sf --max-time 5 "http://127.0.0.1:${BRIDGE_PORT}/health" >/dev/null 2>&1; then
        ok "bridge is running ✓"
        curl -s "http://127.0.0.1:${BRIDGE_PORT}/health"
        echo ""
        # Check worker
        if curl -sf --max-time 3 "http://127.0.0.1:${WORKER_PORT}/health" >/dev/null 2>&1; then
            ok "worker is running ✓"
        else
            warn "worker health check failed (port ${WORKER_PORT})"
        fi

        # Verify agents are seeded
        AGENT_COUNT=$(curl -sf --max-time 5 "http://127.0.0.1:${BRIDGE_PORT}/api/agents" 2>/dev/null \
            | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
        if [[ "${AGENT_COUNT}" -gt 0 ]]; then
            ok "agents ready: ${AGENT_COUNT} agents seeded"
        else
            warn "no agents found — run: python musu-bridge/seed_agents.py"
        fi

        # Verify CLI is available
        if command -v claude &>/dev/null; then
            ok "AI CLI: claude $(claude --version 2>/dev/null | head -1)"
        elif command -v gemini &>/dev/null; then
            ok "AI CLI: gemini detected"
        elif command -v codex &>/dev/null; then
            ok "AI CLI: codex detected"
        else
            warn "No AI CLI found (claude/gemini/codex). Agents won't execute."
            echo "    Install: https://docs.anthropic.com/en/docs/claude-code"
        fi
    else
        warn "health check failed. Logs:"
        echo "  tail -50 ${ROOT}/logs/bridge-install-start.log"
        [[ "${INSTALL_SERVICE}" == "1" ]] && echo "  journalctl --user -u musu-bridge -n 30"
        exit 1
    fi
fi

# ── Step 8: HTTPS with Caddy (--https) ────────────────────────────────────────
if [[ "${INSTALL_HTTPS}" == "1" ]]; then
    info "Step 8: setting up HTTPS with Caddy..."
    if command -v caddy &>/dev/null; then
        ok "Caddy already installed"
    elif command -v apt-get &>/dev/null; then
        sudo apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null 2>&1
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
        sudo apt-get update -q >/dev/null 2>&1 && sudo apt-get install -y -q caddy >/dev/null 2>&1
        ok "Caddy installed"
    else
        warn "Cannot auto-install Caddy (non-apt system). Install manually: https://caddyserver.com/docs/install"
    fi
    if command -v caddy &>/dev/null; then
        CADDY_FILE="/etc/caddy/Caddyfile"
        if [[ ! -f "${CADDY_FILE}" ]] || ! grep -q "localhost:8070" "${CADDY_FILE}" 2>/dev/null; then
            echo "Caddy needs a domain. See docs/PRODUCTION.md for TLS setup."
            echo "  Example: musu.yourdomain.com { reverse_proxy localhost:8070 }"
        else
            ok "Caddy already configured for MUSU"
        fi
    fi
else
    info "Step 8: HTTPS skipped (no --https flag). See docs/PRODUCTION.md for TLS setup."
fi

# ── Final summary ────────────────────────────────────────────────────────────
echo ""
ok "=== MUSU is ready ==="
echo ""
echo "  What you can do now:"
echo "    export MUSU_BRIDGE_TOKEN=\$(grep ^MUSU_BRIDGE_TOKEN= ~/.musu/bridge.env | cut -d= -f2)"
echo ""
echo "    # Health check"
echo "    curl http://localhost:8070/health"
echo ""
echo "    # Create your first company (dev-team template)"
echo "    curl -X POST http://localhost:8070/api/companies \\"
echo "      -H \"Authorization: Bearer \$MUSU_BRIDGE_TOKEN\" \\"
echo "      -H \"Content-Type: application/json\" \\"
echo "      -d '{\"name\":\"My Project\",\"template_key\":\"dev-team\",\"purpose\":\"...\"}'"
echo ""
echo "    # Full reference: docs/MANUAL.md  /  QUICKSTART.md"
echo ""
