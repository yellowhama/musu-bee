#!/usr/bin/env bash
# MUSU One-Line Installer
# Usage: curl -fsSL https://musu.pro/install.sh | bash
#    or: bash install.sh [--no-bee] [--no-forgejo]
set -euo pipefail

# ── Config ────────────────────────────────────────────────────
MUSU_HOME="${MUSU_HOME:-$HOME/.musu}"
MUSU_ROOT="${MUSU_ROOT:-$HOME/musu-functions}"
MUSU_REPO="${MUSU_REPO:-https://github.com/yellowhama/musu-bee.git}"
MUSU_BIN_URL="${MUSU_BIN_URL:-https://github.com/yellowhama/musu-bee/releases/latest/download}"
BRIDGE_PORT="${MUSU_BRIDGE_PORT:-8070}"
BEE_PORT="${MUSU_BEE_PORT:-3001}"

INSTALL_BEE=1
INSTALL_FORGEJO=0
for arg in "$@"; do
    case "$arg" in
        --no-bee)     INSTALL_BEE=0 ;;
        --no-forgejo) INSTALL_FORGEJO=0 ;;
        --with-forgejo) INSTALL_FORGEJO=1 ;;
    esac
done

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[MUSU]${NC} $*"; }
warn()  { echo -e "${YELLOW}[MUSU]${NC} $*"; }
error() { echo -e "${RED}[MUSU]${NC} $*" >&2; exit 1; }
_STEP=0
_TOTAL_STEPS=12
step()  { _STEP=$((_STEP + 1)); info "[${_STEP}/${_TOTAL_STEPS}] $*"; }

# ══════════════════════════════════════════════════════════════
# Step 1: OS Detection
# ══════════════════════════════════════════════════════════════
step "Detecting OS..."
OS="linux"
ARCH="$(uname -m)"
IS_WSL=0
if [[ "$(uname -s)" == "Darwin" ]]; then
    OS="macos"
elif grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=1
    info "WSL2 detected"
fi
info "OS: $OS ($ARCH)$([ $IS_WSL -eq 1 ] && echo ' [WSL2]')"

# ══════════════════════════════════════════════════════════════
# Step 2: Check Dependencies
# ══════════════════════════════════════════════════════════════
step "Checking dependencies..."

check_cmd() {
    command -v "$1" >/dev/null 2>&1 || error "$1 is required. Install it first."
}

check_cmd python3
check_cmd git

PYTHON_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VER" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VER" | cut -d. -f2)
if [[ "$PYTHON_MAJOR" -lt 3 ]] || [[ "$PYTHON_MAJOR" -eq 3 && "$PYTHON_MINOR" -lt 10 ]]; then
    error "Python 3.10+ required (found $PYTHON_VER)"
fi
info "Python $PYTHON_VER ✓"

if [ $INSTALL_BEE -eq 1 ]; then
    check_cmd node
    NODE_VER=$(node -v | sed 's/v//')
    info "Node.js $NODE_VER ✓"
fi

# ══════════════════════════════════════════════════════════════
# Step 3: Create MUSU Home
# ══════════════════════════════════════════════════════════════
step "Setting up ~/.musu/..."
mkdir -p "$MUSU_HOME/bin"
mkdir -p "$MUSU_HOME/logs"

# ══════════════════════════════════════════════════════════════
# Step 4: Install Binaries (musud, musu, musu-connectsd, musu-portd)
# ══════════════════════════════════════════════════════════════
_BIN_OK=false

# Strategy 1: Copy from repo bin/ (always available after git clone)
if [ -f "$MUSU_ROOT/bin/musud" ]; then
    for _bin in musud musu musu-connectsd musu-portd; do
        if [ -f "$MUSU_ROOT/bin/$_bin" ]; then
            cp "$MUSU_ROOT/bin/$_bin" "$MUSU_HOME/bin/$_bin"
            chmod +x "$MUSU_HOME/bin/$_bin"
        fi
    done
    info "Binaries installed from repo ✓"
    _BIN_OK=true
fi

# Strategy 2: Download from release URL (if repo bins missing)
if [ "$_BIN_OK" = false ] && [ -n "$MUSU_BIN_URL" ]; then
    info "Downloading binaries..."
    if curl -fsSL "${MUSU_BIN_URL}/musud-${OS}-${ARCH}" -o "$MUSU_HOME/bin/musud" 2>/dev/null; then
        curl -fsSL "${MUSU_BIN_URL}/musu-${OS}-${ARCH}" -o "$MUSU_HOME/bin/musu" 2>/dev/null
        chmod +x "$MUSU_HOME/bin/musud" "$MUSU_HOME/bin/musu" 2>/dev/null
        info "Binaries downloaded ✓"
        _BIN_OK=true
    else
        rm -f "$MUSU_HOME/bin/musud" "$MUSU_HOME/bin/musu" 2>/dev/null
    fi
fi

# Verify: musud MUST exist
if [ ! -x "$MUSU_HOME/bin/musud" ]; then
    echo -e "${RED}[MUSU]${NC} musud binary not found! Install failed." >&2
    echo -e "${RED}[MUSU]${NC} Fix: cd $MUSU_ROOT && cargo build --release -p musud && cp target/release/musud bin/" >&2
    exit 1
fi

# Symlink to PATH
mkdir -p "$HOME/.local/bin"
for _bin in musud musu musu-connectsd musu-portd; do
    if [ -f "$MUSU_HOME/bin/$_bin" ]; then
        ln -sf "$MUSU_HOME/bin/$_bin" "$HOME/.local/bin/$_bin" 2>/dev/null || true
    fi
done
info "Binaries in PATH ✓"

# ══════════════════════════════════════════════════════════════
# Step 5: Clone or Update Repository
# ══════════════════════════════════════════════════════════════
if [ -d "$MUSU_ROOT/.git" ]; then
    info "Repository exists at $MUSU_ROOT — pulling latest..."
    cd "$MUSU_ROOT"
    git pull --quiet 2>/dev/null || warn "git pull failed (offline?)"
else
    info "Cloning repository..."
    git clone --depth 1 "$MUSU_REPO" "$MUSU_ROOT" 2>/dev/null || \
        error "Failed to clone $MUSU_REPO"
    info "Repository cloned ✓"
fi
cd "$MUSU_ROOT"

# ══════════════════════════════════════════════════════════════
# Step 6: Python Virtual Environment + Packages
# ══════════════════════════════════════════════════════════════
step "Setting up Python environment..."

VENV="$MUSU_ROOT/musu-bridge/.venv"
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
    info "Virtual environment created ✓"
fi

PIP="$VENV/bin/pip"
"$PIP" install --quiet --upgrade pip 2>/dev/null || true

# Install packages
for pkg in musu-core musu-bridge musu-worker; do
    if [ -d "$MUSU_ROOT/$pkg" ]; then
        "$PIP" install --quiet -e "$MUSU_ROOT/$pkg" 2>/dev/null && \
            info "$pkg installed ✓" || warn "$pkg install failed"
    fi
done

# musu-control (MCP server)
if [ -d "$MUSU_ROOT/musu-control" ]; then
    "$PIP" install --quiet -e "$MUSU_ROOT/musu-control" 2>/dev/null && \
        info "musu-control installed ✓" || warn "musu-control install failed"
fi

# musu-indexer (optional)
if [ -d "$MUSU_ROOT/musu-indexer" ]; then
    INDEXER_VENV="$MUSU_ROOT/musu-indexer/.venv"
    if [ ! -d "$INDEXER_VENV" ]; then
        python3 -m venv "$INDEXER_VENV" 2>/dev/null || true
    fi
    "$INDEXER_VENV/bin/pip" install --quiet -e "$MUSU_ROOT/musu-indexer" 2>/dev/null && \
        info "musu-indexer installed ✓" || true
fi

# ══════════════════════════════════════════════════════════════
# Step 7: Node.js Dependencies (musu-bee)
# ══════════════════════════════════════════════════════════════
if [ $INSTALL_BEE -eq 1 ] && [ -d "$MUSU_ROOT/musu-bee" ]; then
    step "Installing musu-bee dependencies..."
    cd "$MUSU_ROOT/musu-bee"
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install --silent 2>/dev/null && info "musu-bee deps installed (pnpm) ✓" || warn "pnpm install failed"
    else
        npm install --silent 2>/dev/null && info "musu-bee deps installed (npm) ✓" || warn "npm install failed"
    fi
    # Generate .env.local with Supabase config (same project as musu.pro)
    if [ ! -f .env.local ]; then
        cat > .env.local << BEEENV
NEXT_PUBLIC_AUTH_ENABLED=true
NEXT_PUBLIC_SUPABASE_URL=https://poyclapxmvulvboiebxq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveWNsYXB4bXZ1bHZib2llYnhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDY1NTgsImV4cCI6MjA4MjA4MjU1OH0.gidOCIahG8AM4yCEWuH49Xth9gqqMqkYiUgwRcmrAgQ
MUSU_BRIDGE_TOKEN=$(cat "$MUSU_HOME/bridge_token" 2>/dev/null || openssl rand -hex 32)
NEXT_PUBLIC_MUSU_BRIDGE_URL=http://localhost:8070
BEEENV
        info "musu-bee .env.local created ✓ (auth enabled)"
    fi
    # Pre-build for production (faster cold start)
    info "Building musu-bee production..."
    ./node_modules/.bin/next build 2>/dev/null && info "musu-bee built ✓" || warn "musu-bee build failed (will use dev mode)"
    cd "$MUSU_ROOT"
fi

# ══════════════════════════════════════════════════════════════
# Step 8: Generate musu.toml
# ══════════════════════════════════════════════════════════════
# Always regenerate if missing [services.bridge] (old format detection)
_NEED_TOML=false
if [ ! -f "$MUSU_HOME/musu.toml" ]; then
    _NEED_TOML=true
elif ! grep -q "\[services\.bridge\]" "$MUSU_HOME/musu.toml" 2>/dev/null; then
    warn "musu.toml exists but has old format — regenerating..."
    cp "$MUSU_HOME/musu.toml" "$MUSU_HOME/musu.toml.bak"
    _NEED_TOML=true
fi

if [ "$_NEED_TOML" = true ]; then
    step "Generating musu.toml..."

    # Detect if this is a secondary node (primary URL provided via env)
    _PRIMARY_URL="${MUSU_PRIMARY_URL:-}"
    _NODE_ROLE="primary"
    if [ -n "$_PRIMARY_URL" ]; then
        _NODE_ROLE="secondary"
    fi

    cat > "$MUSU_HOME/musu.toml" << TOML
grace_period_secs = 15

# ── Bridge: FastAPI agent orchestration server ──────────────
[services.bridge]
enabled = false
command = "${MUSU_ROOT}/scripts/start-bridge.sh"
restart = "on-failure"
[services.bridge.health]
http = "http://127.0.0.1:${BRIDGE_PORT}/health"
interval_secs = 30
failure_threshold = 3

# ── Bee: Next.js web UI ─────────────────────────────────────
[services.bee]
enabled = false
command = "${MUSU_ROOT}/scripts/start-bee.sh"
restart = "on-failure"
[services.bee.health]
http = "http://127.0.0.1:${BEE_PORT}"
interval_secs = 60
failure_threshold = 5

# ── Connectsd: QUIC P2P daemon (기기 간 직접 통신) ──────────
[services.connectsd]
command = "${MUSU_ROOT}/bin/musu-connectsd"
args = ["daemon", "--bridge-url", "http://127.0.0.1:${BRIDGE_PORT}"]
restart = "on-failure"

# ── Portd: service discovery + port routing ─────────────────
[services.portd]
command = "${MUSU_HOME}/bin/musu-portd"
restart = "on-failure"
[services.portd.health]
http = "http://127.0.0.1:1355/health"
interval_secs = 60
failure_threshold = 3

# ── Worker: remote command execution ────────────────────────
[services.worker]
command = "${MUSU_ROOT}/musu-worker/.venv/bin/python"
args = ["-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9700"]
restart = "on-failure"
enabled = false

[ports]
bridge = ${BRIDGE_PORT}
bee = ${BEE_PORT}
portd = 1355
worker = 9700

[env]
MUSU_NODE_ROLE = "${_NODE_ROLE}"
MUSU_NODE_HEARTBEAT_ENABLED = "true"
MUSU_PRIMARY_URL = "${_PRIMARY_URL}"
MUSU_AGENT_PREFIX = "$(hostname -s 2>/dev/null || echo local)"
TOML
    info "musu.toml created ✓"
else
    # Ensure bridge/bee are disabled in musu.toml (systemd manages them)
    if grep -q '^\[services\.bridge\]' "$MUSU_HOME/musu.toml" && ! grep -q 'enabled = false' "$MUSU_HOME/musu.toml"; then
        sed -i '/\[services\.bridge\]/a enabled = false' "$MUSU_HOME/musu.toml"
        info "musu.toml: bridge disabled (systemd manages it)"
    fi
    info "musu.toml OK (services configured)"
fi

# ══════════════════════════════════════════════════════════════
# Step 9: Generate bridge.env
# ══════════════════════════════════════════════════════════════
if [ ! -f "$MUSU_HOME/bridge.env" ]; then
    step "Generating bridge.env..."
    TOKEN=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | head -c 64)
    cat > "$MUSU_HOME/bridge.env" << ENV
# MUSU Bridge Environment — generated by install.sh
MUSU_BRIDGE_TOKEN=${TOKEN}
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=${BRIDGE_PORT}
MUSU_RELAY_ENABLED=true
MUSU_RELAY_URL=wss://musu-relay-production.up.railway.app
ENV
    echo "$TOKEN" > "$MUSU_HOME/bridge_token"
    chmod 600 "$MUSU_HOME/bridge_token" "$MUSU_HOME/bridge.env"
    info "bridge.env + token created ✓"
else
    info "bridge.env already exists — skipping"
fi

# ══════════════════════════════════════════════════════════════
# Step 9.5: MUSU_TOKEN — musu.pro device registration
# ══════════════════════════════════════════════════════════════
MUSU_TOKEN_FILE="$MUSU_HOME/musu_token"
if [ ! -f "$MUSU_TOKEN_FILE" ]; then
    info "Registering device with musu.pro..."
    MUSU_PRO_URL="${MUSU_PRO_URL:-https://musu.pro}"
    DEVICE_API="${MUSU_PRO_URL}/api/v1/auth/device"
    _NODE_NAME="${MUSU_AGENT_PREFIX:-$(hostname)}"

    if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        RESP=$(curl -sf --max-time 5 \
            -X POST "${DEVICE_API}" \
            -H "Content-Type: application/json" \
            -d "{\"node_name\":\"${_NODE_NAME}\"}" 2>/dev/null || echo "")

        # Verify response is valid JSON before parsing
        if [ -n "$RESP" ] && echo "$RESP" | jq empty 2>/dev/null; then
            DEVICE_CODE=$(echo "$RESP" | jq -r '.device_code // empty' 2>/dev/null)
            VERIFY_URI=$(echo "$RESP"  | jq -r '.verification_uri // empty' 2>/dev/null)

            if [ -n "$DEVICE_CODE" ] && [ -n "$VERIFY_URI" ]; then
                echo ""
                echo "  ┌─────────────────────────────────────────────────────┐"
                echo "  │  🐝  Device approval required                       │"
                echo "  │                                                      │"
                echo "  │  Open this URL in your browser and click Approve:   │"
                echo "  │  ${VERIFY_URI}"
                echo "  │                                                      │"
                echo "  │  Waiting for approval...                            │"
                echo "  └─────────────────────────────────────────────────────┘"
                echo ""

                # Auto-open browser
                if [ $IS_WSL -eq 1 ]; then
                    cmd.exe /c start "" "$VERIFY_URI" 2>/dev/null &
                elif command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
                    xdg-open "$VERIFY_URI" 2>/dev/null &
                elif command -v open >/dev/null 2>&1; then
                    open "$VERIFY_URI" 2>/dev/null &
                fi

                # Poll every 5s until approved or expired (max 15 min)
                while true; do
                    sleep 5
                    printf "."
                    POLL_OUT=$(curl -s -w "\n%{http_code}" --max-time 5 \
                        "${DEVICE_API}/token?device_code=${DEVICE_CODE}" 2>/dev/null || printf "\n000")
                    HTTP_STATUS=$(printf '%s' "$POLL_OUT" | tail -1)
                    POLL_RESP=$(printf '%s' "$POLL_OUT" | head -n -1)

                    if [ "$HTTP_STATUS" = "200" ]; then
                        _TOKEN=$(echo "$POLL_RESP" | jq -r '.token // empty' 2>/dev/null)
                        if [ -n "$_TOKEN" ]; then
                            echo "$_TOKEN" > "$MUSU_TOKEN_FILE"
                            chmod 600 "$MUSU_TOKEN_FILE"
                            echo ""
                            info "Device approved ✓ — token saved"
                            break
                        fi
                    elif [ "$HTTP_STATUS" = "410" ]; then
                        echo ""
                        warn "Device code expired. Requesting new code..."
                        # Get a new device code and continue
                        RESP=$(curl -sf --max-time 5 \
                            -X POST "${DEVICE_API}" \
                            -H "Content-Type: application/json" \
                            -d "{\"node_name\":\"${_NODE_NAME}\"}" 2>/dev/null || echo "")
                        if [ -n "$RESP" ] && echo "$RESP" | jq empty 2>/dev/null; then
                            DEVICE_CODE=$(echo "$RESP" | jq -r '.device_code // empty' 2>/dev/null)
                            VERIFY_URI=$(echo "$RESP"  | jq -r '.verification_uri // empty' 2>/dev/null)
                            if [ -n "$DEVICE_CODE" ] && [ -n "$VERIFY_URI" ]; then
                                echo ""
                                echo "  New code: ${VERIFY_URI}"
                                echo "  Open in browser and approve."
                                echo ""
                                if [ $IS_WSL -eq 1 ]; then
                                    cmd.exe /c start "" "$VERIFY_URI" 2>/dev/null &
                                elif command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
                                    xdg-open "$VERIFY_URI" 2>/dev/null &
                                elif command -v open >/dev/null 2>&1; then
                                    open "$VERIFY_URI" 2>/dev/null &
                                fi
                            else
                                error "Failed to get new device code from musu.pro"
                            fi
                        else
                            error "Cannot reach musu.pro — check your internet connection"
                        fi
                    fi
                done

                if [ ! -f "$MUSU_TOKEN_FILE" ]; then
                    error "Device registration failed. Run install.sh again."
                fi
            else
                warn "musu.pro returned unexpected response — skipping device auth"
            fi
        else
            warn "Could not reach musu.pro — skipping device auth (bridge works offline)"
        fi
    else
        warn "curl/jq not found — skipping device auth"
    fi
else
    info "MUSU_TOKEN already exists ✓"
fi

# ══════════════════════════════════════════════════════════════
# Step 10: Install systemd Service
# ══════════════════════════════════════════════════════════════
if command -v systemctl >/dev/null 2>&1; then
    step "Setting up systemd service..."
    mkdir -p "$HOME/.config/systemd/user"

    MUSUD_BIN="$MUSU_HOME/bin/musud"
    if [ ! -x "$MUSUD_BIN" ] && [ -x "$MUSU_ROOT/bin/musud" ]; then
        MUSUD_BIN="$MUSU_ROOT/bin/musud"
    fi

    cat > "$HOME/.config/systemd/user/musud.service" << SVC
[Unit]
Description=MUSU Process Supervisor
After=network.target

[Service]
Type=simple
WorkingDirectory=${MUSU_ROOT}
ExecStart=${MUSUD_BIN}
KillMode=mixed
TimeoutStopSec=20
SendSIGKILL=yes
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SVC

    # Bridge systemd unit (more reliable than musud for long-running services)
    cat > "$HOME/.config/systemd/user/musu-bridge.service" << BSVC
[Unit]
Description=MUSU Bridge API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${MUSU_ROOT}
ExecStart=${MUSU_ROOT}/scripts/start-bridge.sh
Environment="PATH=${HOME}/.npm-global/bin:${HOME}/.local/bin:/usr/lib/wsl/lib:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="MUSU_CEO_HEARTBEAT_ENABLED=true"
Environment="MUSU_TEAM_LEAD_HEARTBEAT_ENABLED=true"
Environment="MUSU_NODE_HEARTBEAT_ENABLED=true"
Environment="MUSU_AGENT_PREFIX=$(hostname -s 2>/dev/null || echo local)"
Restart=on-failure
RestartSec=10
KillMode=mixed

[Install]
WantedBy=default.target
BSVC

    # Bee systemd unit
    cat > "$HOME/.config/systemd/user/musu-bee.service" << BEESVC
[Unit]
Description=MUSU Bee Web UI (Next.js)
After=musu-bridge.service

[Service]
Type=simple
WorkingDirectory=${MUSU_ROOT}
ExecStart=${MUSU_ROOT}/scripts/start-bee.sh
Environment="PATH=${HOME}/.npm-global/bin:${HOME}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
BEESVC

    # musu.target — one command to start/stop everything
    cat > "$HOME/.config/systemd/user/musu.target" << TGTF
[Unit]
Description=MUSU — All Services
Wants=musud.service musu-bridge.service musu-bee.service

[Install]
WantedBy=default.target
TGTF

    systemctl --user daemon-reload
    systemctl --user enable musu.target 2>/dev/null
    # Enable linger so services start on boot (even without login)
    if loginctl enable-linger "$USER" 2>/dev/null; then
        info "enable-linger ✓ (services start on boot)"
    else
        warn "enable-linger failed — services won't auto-start on boot. Run: sudo loginctl enable-linger $USER"
    fi
    info "systemd: musu.target registered ✓ (one command: systemctl --user start musu.target)"

    # Auto-update timer
    if [ -f "$MUSU_ROOT/scripts/systemd/musu-autoupdate.timer" ]; then
        cp "$MUSU_ROOT/scripts/systemd/musu-autoupdate.timer" "$HOME/.config/systemd/user/"
        cp "$MUSU_ROOT/scripts/systemd/musu-autoupdate.service" "$HOME/.config/systemd/user/"
        systemctl --user daemon-reload
        systemctl --user enable musu-autoupdate.timer 2>/dev/null
        systemctl --user start musu-autoupdate.timer 2>/dev/null
        info "Auto-update timer registered ✓"
    fi
else
    warn "systemd not available — start manually with: $MUSUD_BIN"
fi

# ══════════════════════════════════════════════════════════════
# Step 11: Add musu to PATH
# ══════════════════════════════════════════════════════════════
MUSU_CLI="$MUSU_HOME/bin/musu"
if [ ! -x "$MUSU_CLI" ] && [ -x "$MUSU_ROOT/bin/musu" ]; then
    MUSU_CLI="$MUSU_ROOT/bin/musu"
fi
mkdir -p "$HOME/.local/bin"
ln -sf "$MUSU_CLI" "$HOME/.local/bin/musu" 2>/dev/null || true
ln -sf "$MUSUD_BIN" "$HOME/.local/bin/musud" 2>/dev/null || true

# Add to PATH if not already there
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        if [ -f "$rc" ] && ! grep -q '.local/bin' "$rc"; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
        fi
    done
fi

# ══════════════════════════════════════════════════════════════
# Step 12: Start Services
# ══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  MUSU Installation Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""

if command -v systemctl >/dev/null 2>&1; then
    info "Starting MUSU..."
    systemctl --user daemon-reload 2>/dev/null
    systemctl --user restart musud musu-bridge musu-bee 2>/dev/null
    sleep 8

    # Health check: wait for bridge to be ready (max 30s)
    _HC_OK=false
    for _hc in $(seq 1 30); do
        if curl -sf --max-time 2 http://127.0.0.1:${BRIDGE_PORT}/health >/dev/null 2>&1; then
            _HC_OK=true
            break
        fi
        sleep 1
    done
    if [ "$_HC_OK" = true ]; then
        info "Bridge health check passed ✓"
    else
        warn "Bridge not responding on :${BRIDGE_PORT} after 30s"
    fi

    if [ -x "$MUSU_CLI" ]; then
        "$MUSU_CLI" status 2>/dev/null || warn "musu status failed — check: journalctl --user -u musud"
    fi
    echo ""
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  MUSU installed successfully!${NC}"
echo ""
echo "  Services:"
echo "    Bridge API    http://localhost:${BRIDGE_PORT}"
[ $INSTALL_BEE -eq 1 ] && echo "    Web UI        http://localhost:${BEE_PORT}"
echo ""
echo "  Next steps:"
[ $INSTALL_BEE -eq 1 ] && echo "    1. Open http://localhost:${BEE_PORT} in your browser"
echo "    2. Check status:   musu status"
echo "    3. View logs:      journalctl --user -u musud -f"
echo ""
echo -e "${GREEN}  Happy building!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
