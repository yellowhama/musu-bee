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
if [ ! -f "$ROOT/musu-bridge/.env" ]; then
    TOKEN=$(openssl rand -hex 32)
    cat > "$ROOT/musu-bridge/.env" << EOF
MUSU_BRIDGE_TOKEN=${TOKEN}
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8070
MUSU_NODE_NAME=$(hostname)
MUSU_CEO_HEARTBEAT_ENABLED=true
MUSU_CEO_HEARTBEAT_INTERVAL=1800
MUSU_NODE_HEARTBEAT_ENABLED=true
MUSU_SELF_HEALING_ENABLED=true
EOF
    log "Generated .env with token: ${TOKEN:0:8}..."
else
    log ".env already exists — skipping"
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
