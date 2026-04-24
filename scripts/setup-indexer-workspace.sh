#!/usr/bin/env bash
# setup-indexer-workspace.sh — Auto-detect and index Bloodline Writers workspace
# Run on each device. Detects which folders exist locally and indexes them.
set -euo pipefail

INDEXER="${HOME}/musu-functions/musu-indexer/.venv/bin/musu-indexer"
if [[ ! -x "$INDEXER" ]]; then
    echo "[indexer] musu-indexer not found at $INDEXER — skipping"
    exit 0
fi

log() { echo "[indexer-setup] $*"; }

# ── 4060 workspace: /home/hugh51/writer/ ─────────────────────────────────────
WRITER_DIR="${HOME}/writer"
if [[ -d "$WRITER_DIR" ]]; then
    PROFILE="$WRITER_DIR/.musu-indexer.json"
    if [[ ! -f "$PROFILE" ]]; then
        log "creating profile: $PROFILE"
        cat > "$PROFILE" << 'JSON'
{
  "name": "bloodline-writers-4060",
  "root": ".",
  "include_roots": ["canon", "drafts", "projects", "references", "llm-wiki", "docs", "reviews", "workflows"],
  "exclude_roots": ["tools"],
  "ignore_globs": ["*.exe", "*.bin", "*.db", "*.db-*"]
}
JSON
    fi
    log "syncing $WRITER_DIR ..."
    cd "$WRITER_DIR" && "$INDEXER" sync --profile "$PROFILE"
    log "done: $WRITER_DIR"
fi

# ── 5070 workspace: /home/hugh/bloodline_work/ ───────────────────────────────
BW_DIR="${HOME}/bloodline_work"
if [[ -d "$BW_DIR" ]]; then
    PROFILE="$BW_DIR/.musu-indexer.json"
    if [[ ! -f "$PROFILE" ]]; then
        log "creating profile: $PROFILE"
        cat > "$PROFILE" << 'JSON'
{
  "name": "bloodline-writers-5070",
  "root": ".",
  "include_roots": ["llm_wiki_vault", "projects", "docs", "TEAM", "claudedocs", "tracking", "workflows", "queue"],
  "exclude_roots": ["comfyui_workflows", "godot_project", "spum_external_assets", "spum_spriteframes", "unity-to-godot-prefab-animation-converter", "unitypackage_extracted", "models", "tools", "data", "logs", "scripts"],
  "ignore_globs": ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.tscn", "*.godot", "*.import", "*.tres", "*.unitypackage", "*.fbx", "*.blend", "*.onnx", "*.bin", "*.wav", "*.mp3", "*.ogg"]
}
JSON
    fi
    log "syncing $BW_DIR ..."
    cd "$BW_DIR" && "$INDEXER" sync --profile "$PROFILE"
    log "done: $BW_DIR"
fi

if [[ ! -d "$WRITER_DIR" && ! -d "$BW_DIR" ]]; then
    log "no Bloodline Writers workspace found on this device — skipping"
fi
