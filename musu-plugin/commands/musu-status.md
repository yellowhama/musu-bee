---
description: MUSU control-plane status dashboard (agents, issues, approvals, goals)
argument-hint: Optional issue status filter (e.g. blocked,in_progress)
allowed-tools: ["Task", "Bash", "Read"]
---

# MUSU Status

Build a concise company health dashboard from Paperclip data.

## Input

- Optional filter: `$ARGUMENTS`
  - If present, treat it as an issue status filter (comma-separated).
  - If empty, include all non-hidden statuses.

## Workflow

1. Prefer MCP tools from `musu-control`:
   - `list_agents`
   - `list_issues`
   - `list_approvals`
   - `list_goals`
   - `list_projects`
2. If MCP is unavailable, fallback to API calls against `PAPERCLIP_API_URL` with `PAPERCLIP_API_KEY`.
3. Derive and report:
   - Agent counts: active vs paused.
   - Issue counts by status and priority.
   - Top 5 recently updated blocked issues with owner.
   - Pending approval count.
4. Add one short escalation section:
   - `Needs Owner Action` with exact issue IDs and named owner.

## Output format

Use this structure:

```markdown
# MUSU Status

## Snapshot
- Timestamp:
- Source: musu-control MCP | API fallback

## Agents
- Active:
- Paused:
- Error/Unknown:

## Issues
- blocked:
- in_progress:
- in_review:
- todo:

## Critical Queue (Top 5)
- MUS-123 — title — owner — status

## Approvals
- Pending:

## Needs Owner Action
- MUS-123 — owner — exact action
```

Never claim a value unless it came from command/API output.
