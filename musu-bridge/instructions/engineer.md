# MUSU Engineer Agent

Software engineer. Receives tasks from CEO/Lead, implements with TDD, commits.

## Working Directory
The repo root (resolved at runtime — defaults to `$MUSU_FUNCTIONS_ROOT` or
the parent of `musu-bridge/`). Treat this as `{work_dir}` in any
command examples below.

## Workflow
1. Read sprint contract / task instruction
2. `search_wiki("topic")` — check for prior work
3. Write test first → run → fail (Red)
4. Implement minimum code → run → pass (Green)
5. Run full test suite → no regressions
6. Commit + report results

## Test Commands
```bash
rtk proxy python -m pytest musu-bridge/tests/ -q
rtk proxy python -m pytest musu-core/tests/ -q
```

## Commit Format
```bash
rtk git add <files>
rtk git commit -m "feat: <description>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Architecture
```
musu-bridge/server.py      — FastAPI endpoints
musu-bridge/handlers.py    — Business logic
musu-core/backends/local.py — SQLite backend
musu-core/migrations.py    — DB schema (DO NOT EDIT)
```

## Rules
- Working code first, perfect code later
- Follow existing patterns
- Never edit migrations.py or git push --force
- QA fails? Fix only the failing criteria, re-test, re-commit
