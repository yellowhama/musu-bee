---
description: Create and assign a Paperclip issue with explicit ownership
argument-hint: Title with optional assignee priority and status flags
allowed-tools: ["Task", "Bash", "Read", "AskUserQuestion"]
---

# MUSU Assign

Create a new issue and assign it to a concrete owner.

## Input

- Parse `$ARGUMENTS` for:
  - Title (required)
  - `assignee:<...>` (recommended)
  - `priority:<...>` (default `medium`)
  - `status:<...>` (default `todo`)
- If title is missing, ask user for title.
- If assignee is missing, ask user to confirm assignee or leave unassigned.

## Workflow

1. Resolve assignee:
   - If `assignee:` is agent ID, use as-is.
   - Else resolve name with `list_agents`.
2. Determine goal/project:
   - Prefer explicit IDs if user supplied them.
   - Otherwise use current company defaults only if they are unambiguous.
3. Create issue via `create_issue`.
4. Post a kickoff comment that includes:
   - scope summary
   - acceptance bullets
   - evidence expectation
5. Return the created issue identifier and links/IDs.

## Output format

```markdown
# MUSU Assign

- Created:
  - identifier:
  - issueId:
  - status:
  - priority:
- Assignee:
  - name:
  - id:
- Follow-up comment posted: yes|no
```

If creation fails, return the exact error and stop.
