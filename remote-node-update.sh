#!/bin/bash
# MUSU Remote Node Auto-Updater
# cron: */5 * * * *
# 메인 노드에서 push하면 자동 pull + 재빌드 + 재시작

REPO="$HOME/musu-bee"
LOG="$REPO/update.log"
LOCK="$REPO/.update-lock"
TS=$(date +%Y-%m-%dT%H:%M:%S)
PORTD_BIN="$REPO/musu-port/target/release/musu-portd"

# 이미 업데이트 중이면 스킵
if [ -f "$LOCK" ]; then
    exit 0
fi

# 새 바이너리가 실행 중인 프로세스보다 새로우면 재시작 (이전 빌드 반영)
if [ -f "$PORTD_BIN" ]; then
    PORTD_PID=$(pgrep -x musu-portd | head -1) || true
    if [ -n "$PORTD_PID" ]; then
        BIN_MTIME=$(stat -c %Y "$PORTD_BIN" 2>/dev/null || echo 0)
        PROC_STIME=$(stat -c %Y /proc/$PORTD_PID/exe 2>/dev/null || echo 9999999999)
        if [ "$BIN_MTIME" -gt "$PROC_STIME" ]; then
            echo "$TS RESTART_STALE_PORTD pid=$PORTD_PID bin_mtime=$BIN_MTIME proc_stime=$PROC_STIME" >> "$LOG"
            kill "$PORTD_PID" 2>/dev/null || true
            sleep 2
            MUSU_PORT_MANAGER_HOST=0.0.0.0 nohup "$PORTD_BIN" >> "$LOG" 2>&1 &
            echo "$TS RESTARTED_PORTD pid=$!" >> "$LOG"
        fi
    fi
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

# 자기 자신 업데이트 (cron 스크립트 최신화)
if [ -f "$REPO/scripts/remote-node-update.sh" ]; then
    cp "$REPO/scripts/remote-node-update.sh" "$REPO/remote-node-update.sh" 2>/dev/null || true
    chmod +x "$REPO/remote-node-update.sh" 2>/dev/null || true
    echo "$TS SELF_UPDATED" >> "$LOG"
fi

# 재빌드 (변경된 모듈만)
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

if echo "$CHANGED" | grep -q "musu-port/"; then
    echo "$TS REBUILD musu-port" >> "$LOG"
    cd "$REPO/musu-port" && cargo build --release >> "$LOG" 2>&1
    BUILD_EXIT=$?
    cd "$REPO"
    if [ $BUILD_EXIT -eq 0 ]; then
        # 빌드 성공 — 실행 중인 portd 재시작
        OLD_PID=$(pgrep -x musu-portd | head -1) || true
        if [ -n "$OLD_PID" ]; then
            kill "$OLD_PID" 2>/dev/null || true
            sleep 2
        fi
        MUSU_PORT_MANAGER_HOST=0.0.0.0 nohup "$PORTD_BIN" >> "$LOG" 2>&1 &
        echo "$TS RESTARTED_PORTD pid=$! after_build=true" >> "$LOG"
    else
        echo "$TS BUILD_FAILED exit=$BUILD_EXIT" >> "$LOG"
    fi
fi

if echo "$CHANGED" | grep -q "musu-connects/"; then
    echo "$TS REBUILD musu-connects" >> "$LOG"
    cd "$REPO/musu-connects" && cargo build --release >> "$LOG" 2>&1
fi

echo "$TS UPDATE_DONE $(git rev-parse --short HEAD)" >> "$LOG"
rm -f "$LOCK"
