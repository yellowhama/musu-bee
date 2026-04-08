---
description: MUSU issue board view with optional status/assignee filter
argument-hint: Optional query text with status and assignee filters
allowed-tools: ["Task", "Bash", "Read"]
---

# MUSU Board

Show a triage-ready issue board from Paperclip.

## Input parsing

- Read `$ARGUMENTS` as a free-form filter.
- Support:
  - status hints: `blocked`, `todo`, `in_progress`, `in_review`, `done`
  - assignee hint: `assignee:<name-or-id>`
  - free-text query: remaining words

## Workflow

1. Pull issues from `musu-control` (`list_issues`) with available filters.
2. If assignee is given as name, resolve to agent ID via `list_agents`.
3. Sort by:
   1. Priority (`critical`, `high`, `medium`, `low`)
   2. Updated time (newest first)
4. Render grouped by status with the following fields:
   - identifier
   - title
   - priority
   - assignee
   - updatedAt
5. Add `Execution Next` section with a numbered recommendation:
   - pick the highest-priority unblocked issue assigned to caller role.

## Output format

```markdown
# MUSU Board

## Filters Applied
- status:
- assignee:
- query:

## blocked
- MUS-123 | high | Founding Engineer | 2026-04-08T04:10:00Z
  title...

## in_progress
- ...

## todo
- ...

## Execution Next
1. MUS-456 — reason
```

If no issues match, say `No issues match the current filters.`
