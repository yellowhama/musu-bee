#!/usr/bin/env bash
# init.sh — First-time setup for a new MUSU node.
# Run after: git clone <repo> ~/musu-functions && cd ~/musu-functions
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[init] $*"; }

# ── 1. Create user data directories ──────────────────────────────────────────
mkdir -p ~/.musu
mkdir -p "$ROOT/.musu/tasks"
mkdir -p "$ROOT/.musu/experience"
mkdir -p "$ROOT/.musu/skills"

# ── 2. Copy templates if user files don't exist ──────────────────────────────
if [ ! -f "$ROOT/.musu/charter.md" ]; then
    cp "$ROOT/.musu/charter.example.md" "$ROOT/.musu/charter.md"
    log "Created charter.md from template — edit it with your company mission"
fi

if [ ! -f "$ROOT/.musu/agent-defaults.json" ]; then
    cp "$ROOT/.musu/agent-defaults.example.json" "$ROOT/.musu/agent-defaults.json"
    log "Created agent-defaults.json from template"
fi

# ── 3. Generate bridge token if not set ──────────────────────────────────────
# Canonical bridge env file path is ~/.musu/bridge.env (matches systemd
# unit's EnvironmentFile=-%h/.musu/bridge.env and install.sh's behavior).
# BRIDGE_HOST default is 127.0.0.1 (localhost only). Set to 0.0.0.0 explicitly
# if this node must be reachable from mesh peers — the bearer token is then
# the only auth, so don't expose it without setting MUSU_BRIDGE_TOKEN.
if [ ! -f "$HOME/.musu/bridge.env" ]; then
    TOKEN=$(openssl rand -hex 32)
    cat > "$HOME/.musu/bridge.env" << EOF
MUSU_BRIDGE_TOKEN=${TOKEN}
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8070
MUSU_NODE_NAME=$(hostname)
MUSU_CEO_HEARTBEAT_ENABLED=true
MUSU_CEO_HEARTBEAT_INTERVAL=1800
MUSU_NODE_HEARTBEAT_ENABLED=true
MUSU_SELF_HEALING_ENABLED=true
EOF
    chmod 600 "$HOME/.musu/bridge.env"
    log "Generated ~/.musu/bridge.env with token: ${TOKEN:0:8}..."
else
    log "~/.musu/bridge.env already exists — skipping"
fi

# ── 4. Install Python dependencies ──────────────────────────────────────────
for pkg in musu-bridge musu-core musu-control; do
    if [ -d "$ROOT/$pkg" ] && [ ! -d "$ROOT/$pkg/.venv" ]; then
        log "Installing $pkg..."
        cd "$ROOT/$pkg"
        python3 -m venv .venv
        .venv/bin/pip install -q --upgrade pip
        if [ -f requirements.txt ]; then
            .venv/bin/pip install -q -r requirements.txt
        else
            .venv/bin/pip install -q -e .
        fi
        cd "$ROOT"
    else
        log "$pkg — already installed or not found"
    fi
done

# ── 4b. Download portd binary if missing ─────────────────────────────────
# Only attempts if MUSU_MAIN_IP is explicitly set (no hardcoded operator IP).
# Single-machine installs can skip this entirely — portd is only needed when
# joining a mesh that has a primary node serving the binary.
mkdir -p "$ROOT/bin"
if [ ! -x "$ROOT/bin/musu-portd" ]; then
    if [ -n "${MUSU_MAIN_IP:-}" ]; then
        log "Downloading musu-portd from \$MUSU_MAIN_IP ($MUSU_MAIN_IP)..."
        curl -sL "http://${MUSU_MAIN_IP}:8070/bin/musu-portd" -o "$ROOT/bin/musu-portd" 2>/dev/null && \
            chmod +x "$ROOT/bin/musu-portd" && \
            log "portd downloaded" || \
            log "WARNING: portd download failed — run cargo build manually if needed"
    else
        log "portd binary not present; set MUSU_MAIN_IP=<primary-tailscale-ip> to fetch, or skip if single-machine"
    fi
else
    log "portd binary exists"
fi

# ── 5. Seed agents + apply model distribution ───────────────────────────────
log "Seeding agents..."
"$ROOT/musu-bridge/.venv/bin/python" "$ROOT/musu-bridge/seed_agents.py" 2>&1 | tail -3
log "Applying model distribution..."
"$ROOT/musu-bridge/.venv/bin/python" "$ROOT/scripts/apply-agent-defaults.py" 2>&1 | tail -3 || true

# ── 6. Done ──────────────────────────────────────────────────────────────────
log ""
log "========================================="
log "  MUSU initialized!"
log "========================================="
log ""
log "Next steps:"
log "  1. Edit .musu/charter.md with your company mission"
log "  2. Start the bridge:  systemctl --user start musu-bridge"
log "     Or manually:       cd musu-bridge && .venv/bin/python server.py"
log "  3. Check health:      curl http://localhost:8070/health"
log "  4. Read the manual:   docs/MANUAL.md"
log ""
