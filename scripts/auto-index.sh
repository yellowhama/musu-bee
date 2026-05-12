#!/bin/bash
# MUSU Auto-Indexer (Qwen-independent, Go scanner)
# musu-functions 전체를 리인덱싱
# cron: 0 * * * * (매시간)
# flock으로 중복 실행 방지 + 300s 타임아웃

LOCK="/tmp/musu-auto-index.lock"
# 이미 실행 중이면 즉시 종료 (중복 방지)
exec 9>"$LOCK"
flock -n 9 || exit 0

ROOT="${MUSU_FUNCTIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="$ROOT/.musu_dev.db"
SCANNER="$ROOT/musu-indexer/musu-scanner"
LOG="$ROOT/scripts/auto-index.log"
TS=$(date +%Y-%m-%dT%H:%M:%S)

if [ ! -f "$SCANNER" ]; then
    echo "$TS ERROR scanner not found" >> "$LOG"
    exit 1
fi

# 파일 목록 생성
FILELIST=$(mktemp)
cd "$ROOT"
find . -type f \
  -not -path "./.git/*" \
  -not -path "*/target/*" \
  -not -path "*/.venv*/*" \
  -not -path "*/node_modules/*" \
  -not -path "*/__pycache__/*" \
  -not -path "*/references_AI/BitNet-main/*" \
  -not -path "*/references_AI/*.zip" \
  -not -path "*/.windows-bridge/state/*" \
  -not -path "*/.windows-bridge/queue/*" \
  -not -path "*/.windows-bridge/results/*" \
  -not -path "*/work/*" \
  -not -name "*.db" \
  -not -name "*.db-journal" \
  -not -name "*.db-wal" \
  | sed 's|^\./||' > "$FILELIST"

COUNT=$(wc -l < "$FILELIST")

# 인덱싱 실행 — 300초 타임아웃, nice 19 (낮은 우선순위)
timeout 300 nice -n 19 "$SCANNER" index "$DB" "$ROOT" "$FILELIST" > /dev/null 2>&1
EXIT=$?

rm -f "$FILELIST"

FILES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM files;" 2>/dev/null)
SYMBOLS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM code_symbols;" 2>/dev/null)

if [ "$EXIT" -eq 124 ]; then
    echo "$TS WARN timeout after 300s scanned=$COUNT files=$FILES symbols=$SYMBOLS" >> "$LOG"
else
    echo "$TS OK scanned=$COUNT files=$FILES symbols=$SYMBOLS exit=$EXIT" >> "$LOG"
fi
