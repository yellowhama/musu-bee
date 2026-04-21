#!/usr/bin/env bash
# auto-update.sh — git pull + conditional service restart
# Run via systemd timer (musu-autoupdate.timer) or manually.
# Also triggered by: POST /api/system/update on musu-bridge.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[auto-update] $*"; }

# ── 1. Fetch ──────────────────────────────────────────────────────────────────
if ! git fetch origin main --quiet 2>/dev/null; then
    log "git fetch failed — no network or no remote. skipping."
    exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
    log "cannot resolve origin/main — skipping."
    exit 0
fi

if [ "$LOCAL" = "$REMOTE" ]; then
    log "already up to date (${LOCAL:0:8})"
    exit 0
fi

log "update available: ${LOCAL:0:8} → ${REMOTE:0:8}"

# ── 2. Detect what changed before pulling ────────────────────────────────────
CHANGED=$(git diff --name-only HEAD origin/main 2>/dev/null || echo "")

RESTART_BRIDGE=0
RESTART_CONNECTSD=0

if echo "$CHANGED" | grep -qE "^(musu-bridge|musu-core)/"; then
    RESTART_BRIDGE=1
fi
if echo "$CHANGED" | grep -q "^scripts/start-bridge.sh"; then
    RESTART_BRIDGE=1
fi
if echo "$CHANGED" | grep -q "^bin/musu-connectsd$"; then
    RESTART_CONNECTSD=1
fi

# ── 3. Pull ───────────────────────────────────────────────────────────────────
if ! git pull origin main --quiet 2>&1; then
    log "git pull failed — leaving services unchanged."
    exit 1
fi
log "pulled ${REMOTE:0:8} successfully"

# ── 4. Restart affected services ─────────────────────────────────────────────
if [ "$RESTART_CONNECTSD" = "1" ]; then
    log "restarting musu-connectsd (binary updated)"
    systemctl --user restart musu-connectsd.service || log "WARNING: connectsd restart failed"
fi

if [ "$RESTART_BRIDGE" = "1" ]; then
    log "restarting musu-bridge (bridge/core files updated)"
    systemctl --user restart musu-bridge.service || log "WARNING: bridge restart failed"
fi

if [ "$RESTART_BRIDGE" = "0" ] && [ "$RESTART_CONNECTSD" = "0" ]; then
    log "no service-affecting changes — skipping restarts"
fi

log "done (${REMOTE:0:8})"
