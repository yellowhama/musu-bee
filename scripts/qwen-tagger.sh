#!/bin/bash
# MUSU Qwen Auto-Tagger
# 미태깅 파일에 Qwen으로 의미 기반 태그 부여
# cron: 0 2 * * * (매일 새벽 2시, Qwen 부하 낮을 때)

ROOT="${MUSU_FUNCTIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="${ROOT}/.musu_dev.db"
QWEN="${MUSU_QWEN_URL:-http://127.0.0.1:18081}"
LOG="${ROOT}/scripts/qwen-tagger.log"
BATCH_SIZE=20
MAX_BATCHES=10  # 1회 실행당 최대 200파일
TS=$(date +%Y-%m-%dT%H:%M:%S)

# Qwen 살아있는지 확인
if ! curl -sf --max-time 5 "$QWEN/health" > /dev/null 2>&1; then
    echo "$TS SKIP qwen_down" >> "$LOG"
    exit 0
fi

# tags 컬럼 없으면 추가
sqlite3 "$DB" "ALTER TABLE files ADD COLUMN tags TEXT;" 2>/dev/null

TAGGED=0
FAILED=0

for batch in $(seq 1 $MAX_BATCHES); do
    # 미태깅 코드 파일 가져오기 (reference, config, build artifacts 제외)
    PATHS=$(sqlite3 "$DB" "
        SELECT path FROM files
        WHERE tags IS NULL
          AND category NOT IN ('reference', 'config', 'log')
          AND size > 0 AND size < 50000
          AND path NOT LIKE '%/target/%'
          AND path NOT LIKE '%/target-run-%'
          AND path NOT LIKE '%/node_modules/%'
          AND path NOT LIKE '%/.git/%'
          AND path NOT LIKE '%/__pycache__/%'
          AND (
            path LIKE '%.rs' OR path LIKE '%.py' OR path LIKE '%.ts'
            OR path LIKE '%.tsx' OR path LIKE '%.js' OR path LIKE '%.go'
            OR path LIKE '%.md' OR path LIKE '%.toml' OR path LIKE '%.sh'
            OR path LIKE '%.json' OR path LIKE '%.yaml' OR path LIKE '%.yml'
            OR path LIKE '%.html' OR path LIKE '%.css' OR path LIKE '%.sql'
          )
        ORDER BY RANDOM()
        LIMIT $BATCH_SIZE;
    " 2>/dev/null)

    if [ -z "$PATHS" ]; then
        break
    fi

    while IFS= read -r fpath; do
        FULL="$ROOT/$fpath"
        if [ ! -f "$FULL" ]; then
            sqlite3 "$DB" "UPDATE files SET tags = 'missing' WHERE path = '$fpath';" 2>/dev/null
            continue
        fi

        # 바이너리 파일 스킵 + 첫 50줄 + JSON escape 한번에
        ESCAPED=$(python3 -c "
import json, sys, os
fpath = sys.argv[1]
full = sys.argv[2]
try:
    with open(full, 'r', encoding='utf-8', errors='strict') as f:
        lines = []
        for i, line in enumerate(f):
            if i >= 50: break
            lines.append(line)
        snippet = ''.join(lines)[:3000]
except (UnicodeDecodeError, ValueError):
    print('BINARY')
    sys.exit(0)
if not snippet.strip():
    print('EMPTY')
    sys.exit(0)
prompt = f'Given this file path and code snippet, output exactly 3-5 comma-separated tags describing its purpose and technology. Tags only, no explanation.\n\nPath: {fpath}\n---\n{snippet}'
print(json.dumps(prompt))
" "$fpath" "$FULL" 2>/dev/null)

        # 바이너리/빈 파일 스킵
        if [ "$ESCAPED" = "BINARY" ] || [ "$ESCAPED" = "EMPTY" ] || [ -z "$ESCAPED" ]; then
            sqlite3 "$DB" "UPDATE files SET tags = 'binary' WHERE path = '$(echo "$fpath" | sed "s/'/''/g")';" 2>/dev/null
            continue
        fi

        RESPONSE=$(curl -sf --max-time 30 "$QWEN/v1/chat/completions" \
            -H "Content-Type: application/json" \
            -d "{
                \"model\": \"qwen\",
                \"messages\": [{\"role\": \"user\", \"content\": $ESCAPED}],
                \"max_tokens\": 64,
                \"temperature\": 0.1
            }" 2>/dev/null)

        if [ -z "$RESPONSE" ]; then
            FAILED=$((FAILED + 1))
            continue
        fi

        TAGS=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    content = data['choices'][0]['message']['content'].strip()
    # 태그 정규화: 소문자, 쉼표 구분, 공백 정리
    tags = [t.strip().lower().replace(' ', '-') for t in content.split(',')]
    tags = [t for t in tags if t and len(t) < 30][:5]
    print(','.join(tags))
except:
    pass
" 2>/dev/null)

        if [ -n "$TAGS" ]; then
            sqlite3 "$DB" "UPDATE files SET tags = '$(echo "$TAGS" | sed "s/'/''/g")' WHERE path = '$(echo "$fpath" | sed "s/'/''/g")';" 2>/dev/null
            TAGGED=$((TAGGED + 1))
        else
            FAILED=$((FAILED + 1))
        fi

        # Qwen 부하 제한
        sleep 0.5
    done <<< "$PATHS"
done

REMAINING=$(sqlite3 "$DB" "SELECT COUNT(*) FROM files WHERE tags IS NULL AND category NOT IN ('reference', 'config', 'log') AND size < 50000;" 2>/dev/null)

echo "$TS OK tagged=$TAGGED failed=$FAILED remaining=$REMAINING" >> "$LOG"
