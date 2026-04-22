#!/usr/bin/env bash
# auto-update.sh — git pull + conditional service restart
# Run via systemd timer (musu-autoupdate.timer) or manually.
# Also triggered by: POST /api/system/update on musu-bridge.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[auto-update] $*"; }

# ── 1. Fetch (Forgejo first, fallback to origin) ─────────────────────────────
FETCH_REMOTE="forgejo"
if ! git fetch forgejo main --quiet 2>/dev/null; then
    FETCH_REMOTE="origin"
    if ! git fetch origin main --quiet 2>/dev/null; then
        log "git fetch failed — no network or no remote. skipping."
        exit 0
    fi
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse ${FETCH_REMOTE}/main 2>/dev/null || echo "")

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
CHANGED=$(git diff --name-only HEAD ${FETCH_REMOTE}/main 2>/dev/null || echo "")

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
if ! git pull ${FETCH_REMOTE} main --quiet 2>&1; then
    log "git pull failed — leaving services unchanged."
    exit 1
fi
log "pulled ${REMOTE:0:8} successfully from ${FETCH_REMOTE}"

# ── 3b. Apply agent defaults (model distribution + fallback chains) ──────────
if echo "$CHANGED" | grep -qE "(agent-defaults|apply-agent)"; then
    if [ -f "${ROOT}/scripts/apply-agent-defaults.py" ]; then
        log "applying agent-defaults.json..."
        "${ROOT}/musu-bridge/.venv/bin/python" "${ROOT}/scripts/apply-agent-defaults.py" 2>&1 | tail -3 || \
            log "WARNING: apply-agent-defaults failed"
    fi
fi

# ── 4. Rebuild connectsd from source if glibc-incompatible ──────────────────
if [ "$RESTART_CONNECTSD" = "1" ]; then
    # Quick sanity-check: can the pulled binary even execute on this machine?
    if ! "${ROOT}/bin/musu-connectsd" --version >/dev/null 2>&1; then
        log "pulled binary not executable on this machine (glibc mismatch?) — trying source build"
        if command -v cargo >/dev/null 2>&1 && [ -d "${ROOT}/musu-connects" ]; then
            log "cargo build --release -p musu-connectsd ..."
            if cargo build --release \
                   --manifest-path "${ROOT}/musu-connects/Cargo.toml" \
                   -p musu-connectsd 2>&1 | tail -5; then
                cp "${ROOT}/musu-connects/target/release/musu-connectsd" "${ROOT}/bin/musu-connectsd"
                chmod +x "${ROOT}/bin/musu-connectsd"
                log "built and installed from source"
            else
                log "WARNING: source build failed — connectsd may not start correctly"
            fi
        else
            log "WARNING: cargo not found and binary incompatible — connectsd may not start"
        fi
    fi
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
