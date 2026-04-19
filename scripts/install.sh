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
for arg in "$@"; do
    case "$arg" in
        --service) INSTALL_SERVICE=1 ;;
        --start)   START_BRIDGE=1 ;;
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

# ── Step 5: Init ~/.musu/nodes.toml ──────────────────────────────────────────
NODES_TOML="${MUSU_HOME}/nodes.toml"
if [[ ! -f "${NODES_TOML}" ]]; then
    NODE_NAME="$(hostname)"
    printf '[mesh]\nself = "%s"\n' "${NODE_NAME}" > "${NODES_TOML}"
    ok "nodes.toml initialized (self=${NODE_NAME})"
else
    info "Step 5: nodes.toml already exists — skipping"
fi

# ── Step 6: Build musu-bee ────────────────────────────────────────────────────
BEE_DIR="${ROOT}/musu-bee"
if [[ -d "${BEE_DIR}" && ! -d "${BEE_DIR}/.next" ]]; then
    info "Step 6: building musu-bee (first time)..."
    if command -v node &>/dev/null; then
        cd "${BEE_DIR}"
        npm install --silent 2>/dev/null || true
        npm run build --silent 2>/dev/null && ok "musu-bee build complete" || warn "musu-bee build failed — UI unavailable"
        cd "${ROOT}"
    else
        warn "node not found — skipping musu-bee build. Install Node.js to use the UI."
    fi
else
    info "Step 6: musu-bee build already exists — skipping"
fi

# ── Step 7: Register systemd services (--service) ────────────────────────────
if [[ "${INSTALL_SERVICE}" == "1" ]]; then
    info "Step 7: registering systemd services..."
    bash "${SCRIPT_DIR}/install-musu-bridge-service.sh"

    # Register musu-bee service
    SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
    mkdir -p "${SYSTEMD_USER_DIR}"
    ln -sf "${SCRIPT_DIR}/systemd/musu-bee.service" "${SYSTEMD_USER_DIR}/musu-bee.service"
    systemctl --user daemon-reload
    systemctl --user enable musu-bee 2>/dev/null || true
    ok "systemd services registered (bridge + bee)"
else
    info "Step 7: systemd registration skipped (no --service flag)"
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
    [[ "${INSTALL_SERVICE}" == "1" ]] && echo "    or:  systemctl --user start musu-bridge"
    echo ""
fi

# ── Start bridge immediately (--start) ───────────────────────────────────────
if [[ "${START_BRIDGE}" == "1" ]]; then
    echo ""
    info "Starting bridge..."

    if [[ "${INSTALL_SERVICE}" == "1" ]]; then
        systemctl --user start musu-bridge
        sleep 3
    else
        mkdir -p "${ROOT}/logs"
        nohup bash "${SCRIPT_DIR}/start-bridge.sh" \
            > "${ROOT}/logs/bridge-install-start.log" 2>&1 &
        BRIDGE_PID=$!
        info "  PID: ${BRIDGE_PID}"
        sleep 4
    fi

    BRIDGE_PORT="${BRIDGE_PORT:-8070}"
    if curl -sf --max-time 5 "http://127.0.0.1:${BRIDGE_PORT}/health" >/dev/null 2>&1; then
        ok "bridge is running ✓"
        curl -s "http://127.0.0.1:${BRIDGE_PORT}/health"
        echo ""
    else
        warn "health check failed. Logs:"
        echo "  tail -50 ${ROOT}/logs/bridge-install-start.log"
        [[ "${INSTALL_SERVICE}" == "1" ]] && echo "  journalctl --user -u musu-bridge -n 30"
        exit 1
    fi
fi
