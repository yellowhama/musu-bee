#!/bin/bash
# MUSU Remote Node Auto-Updater
# cron: */5 * * * *
# 메인 노드에서 push하면 자동 pull + 재빌드

REPO="$HOME/musu-bee"
LOG="$REPO/update.log"
LOCK="$REPO/.update-lock"
TS=$(date +%Y-%m-%dT%H:%M:%S)

# 이미 업데이트 중이면 스킵
if [ -f "$LOCK" ]; then
    exit 0
fi

cd "$REPO" || exit 1

# 원격 변경 확인
git fetch origin main --quiet 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    # 변경 없음
    exit 0
fi

# 변경 있음 — 업데이트 시작
touch "$LOCK"
echo "$TS UPDATE_START local=$LOCAL remote=$REMOTE" >> "$LOG"

# pull
git reset --hard origin/main >> "$LOG" 2>&1

# 재빌드 (변경된 모듈만)
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

if echo "$CHANGED" | grep -q "musu-port/"; then
    echo "$TS REBUILD musu-port" >> "$LOG"
    cd "$REPO/musu-port" && cargo build --release >> "$LOG" 2>&1
fi

if echo "$CHANGED" | grep -q "musu-connects/"; then
    echo "$TS REBUILD musu-connects" >> "$LOG"
    cd "$REPO/musu-connects" && cargo build --release >> "$LOG" 2>&1
fi

echo "$TS UPDATE_DONE $(git rev-parse --short HEAD)" >> "$LOG"
rm -f "$LOCK"
