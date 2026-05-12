#!/bin/bash
# opencode-session-archive.sh
# Archives opencode sessions with >20 messages to prevent context overflow.
# Run via cron: */30 * * * * "$MUSU_FUNCTIONS_ROOT/scripts/opencode-session-archive.sh"
#
# Policy: archive sessions with >20 messages (prevents Qwen3.5-9B 131k token overflow)
# See MUS-645 for context.

ROOT="${MUSU_FUNCTIONS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="${MUSU_OPENCODE_DB:-$HOME/.local/share/opencode/opencode.db}"
LOG="${ROOT}/scripts/opencode-session-archive.log"
MAX_MESSAGES=20

if [ ! -f "$DB" ]; then
  echo "$(date -Iseconds) [opencode-archive] DB not found: $DB" >> "$LOG"
  exit 1
fi

NOW_MS=$(date +%s%3N)

ARCHIVED=$(sqlite3 "$DB" "
UPDATE session
SET time_archived = $NOW_MS
WHERE id IN (
  SELECT s.id
  FROM session s
  JOIN message m ON m.session_id = s.id
  WHERE s.time_archived IS NULL
  GROUP BY s.id
  HAVING COUNT(m.id) > $MAX_MESSAGES
);
SELECT changes();
")

echo "$(date -Iseconds) [opencode-archive] Archived $ARCHIVED sessions with >$MAX_MESSAGES messages" >> "$LOG"

# Also archive sessions older than 12 hours regardless of message count
OLD_ARCHIVED=$(sqlite3 "$DB" "
UPDATE session
SET time_archived = $NOW_MS
WHERE time_archived IS NULL
  AND time_created < ($NOW_MS - 12 * 3600 * 1000);
SELECT changes();
")

echo "$(date -Iseconds) [opencode-archive] Archived $OLD_ARCHIVED sessions older than 12h" >> "$LOG"
