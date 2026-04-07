#!/bin/bash
# MUSU Auto-Indexer (Qwen-independent, Go scanner)
# musu-functions 전체를 주기적으로 리인덱싱
# cron: 0 * * * * (매시간)

ROOT="/home/hugh51/musu-functions"
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

# 인덱싱 실행
"$SCANNER" index "$DB" "$ROOT" "$FILELIST" > /dev/null 2>&1
EXIT=$?

rm -f "$FILELIST"

FILES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM files;" 2>/dev/null)
SYMBOLS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM code_symbols;" 2>/dev/null)

echo "$TS OK scanned=$COUNT files=$FILES symbols=$SYMBOLS exit=$EXIT" >> "$LOG"
