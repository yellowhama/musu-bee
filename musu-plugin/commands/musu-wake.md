---
description: Invoke heartbeat for a MUSU agent by ID or name
argument-hint: <agent-id-or-name>
allowed-tools: ["Task", "Bash", "Read", "AskUserQuestion"]
---

# MUSU Wake

Trigger a heartbeat run for an agent safely and with evidence.

## Input

- Required: `$ARGUMENTS`
  - agent ID (`uuid`) or exact/partial agent name.

If missing, ask the user for the target agent.

## Workflow

1. Resolve target:
   - If ID-like, use directly.
   - Else call `list_agents` and resolve by name (case-insensitive).
   - If multiple matches, ask user to choose one.
2. Call `invoke_heartbeat` for the resolved agent ID.
3. Report exact output fields from the response:
   - heartbeat run ID
   - status
   - createdAt
4. If call fails, include raw error and one corrective action.

## Output format

```markdown
# MUSU Wake

- Agent:
- Agent ID:
- Action: invoke_heartbeat
- Result:
  - runId:
  - status:
  - createdAt:
```

Never report success without response payload evidence.
