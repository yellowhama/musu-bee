#!/usr/bin/env bash
# Sync local llm-wiki with remote git repo (push + pull)
# Usage: bash scripts/sync-wiki.sh
#    or: just wiki-sync
set -euo pipefail

WIKI_DIR="${MUSU_WIKI_PATH:-$HOME/llm-wiki}"

if [ ! -d "$WIKI_DIR" ]; then
    echo "[wiki-sync] Wiki directory not found: $WIKI_DIR"
    exit 1
fi

cd "$WIKI_DIR"

# Ensure git repo
if [ ! -d .git ]; then
    echo "[wiki-sync] Initializing git repo..."
    git init
    git add -A
    git commit -m "init: wiki snapshot $(date +%Y-%m-%d)"
fi

# Check remote
if ! git remote | grep -q origin; then
    echo "[wiki-sync] No remote configured."
    echo "  Add one: git -C $WIKI_DIR remote add origin <your-git-url>"
    echo "  Example: git -C $WIKI_DIR remote add origin git@github.com:yourname/llm-wiki.git"
    exit 0
fi

# Stage all changes
git add -A

# Commit if there are changes
if ! git diff --cached --quiet; then
    CHANGED=$(git diff --cached --stat | tail -1)
    git commit -m "wiki: auto-sync $(date +%Y-%m-%d_%H:%M) — $CHANGED"
    echo "[wiki-sync] Committed: $CHANGED"
else
    echo "[wiki-sync] No local changes."
fi

# Pull (rebase to keep clean history)
BRANCH=$(git branch --show-current)
if git pull --rebase origin "$BRANCH" 2>/dev/null; then
    echo "[wiki-sync] Pulled from origin/$BRANCH"
else
    echo "[wiki-sync] Pull failed (remote may not exist yet). Trying push..."
fi

# Push
if git push origin "$BRANCH" 2>/dev/null; then
    echo "[wiki-sync] Pushed to origin/$BRANCH"
else
    echo "[wiki-sync] Push failed — check remote access"
    echo "  Try: git -C $WIKI_DIR push -u origin $BRANCH"
fi

echo "[wiki-sync] Done. $(git log --oneline -1)"
