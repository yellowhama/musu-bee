#!/usr/bin/env bash
# setup-indexer-workspace.sh — Auto-detect and index a writer workspace.
#
# Reads workspace paths from MUSU_WRITER_WORKSPACES (colon-separated, like
# PATH) or falls back to operator's default (~/writer). Each path that
# exists gets indexed; missing paths are skipped silently.
#
# Per-workspace indexer profile lives at <workspace>/.musu-indexer.json.
# If absent, a minimal profile is created.
set -euo pipefail

INDEXER="${MUSU_INDEXER_BIN:-${HOME}/musu-functions/musu-indexer/.venv/bin/musu-indexer}"
if [[ ! -x "$INDEXER" ]]; then
    echo "[indexer] musu-indexer not found at $INDEXER — skipping"
    exit 0
fi

log() { echo "[indexer-setup] $*"; }

# Default workspaces: operator's ~/writer. Override via env var:
#   MUSU_WRITER_WORKSPACES="$HOME/writer:$HOME/bloodline_work"
WORKSPACES="${MUSU_WRITER_WORKSPACES:-${HOME}/writer}"

INDEXED_COUNT=0
IFS=':' read -ra WS_LIST <<< "$WORKSPACES"
for WS in "${WS_LIST[@]}"; do
    [[ -z "$WS" ]] && continue
    if [[ ! -d "$WS" ]]; then
        continue
    fi
    PROFILE="$WS/.musu-indexer.json"
    if [[ ! -f "$PROFILE" ]]; then
        WS_NAME="$(basename "$WS")"
        log "creating default profile: $PROFILE"
        cat > "$PROFILE" << JSON
{
  "name": "${WS_NAME}",
  "root": ".",
  "include_roots": ["canon", "drafts", "projects", "references", "llm-wiki", "docs", "reviews", "workflows"],
  "exclude_roots": ["tools"],
  "ignore_globs": ["*.exe", "*.bin", "*.db", "*.db-*"]
}
JSON
    fi
    log "syncing $WS ..."
    cd "$WS" && "$INDEXER" sync --profile "$PROFILE"
    log "done: $WS"
    INDEXED_COUNT=$((INDEXED_COUNT + 1))
done

if [[ "$INDEXED_COUNT" -eq 0 ]]; then
    log "no writer workspace found (set MUSU_WRITER_WORKSPACES or create ~/writer)"
fi
