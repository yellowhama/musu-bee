---
name: musu-governance
description: Use when operating MUSU packets that require gate-aware execution, heartbeat discipline, explicit blocker ownership, or review handoff policy (G1/G2/G3).
---

# MUSU Governance

This skill standardizes packet execution quality for MUSU.

## Trigger signals

Use this skill when a request includes:

- issue checkout/start, comments, reassignment, or status transition
- blocker handling with owner escalation
- G1/G2/G3 gate language
- heartbeat and execution-evidence expectations

## Core policy

1. Evidence over narration.
2. Explicit owner over vague escalation.
3. `in_review` handoff over direct `done`.
4. Proof command output required before safety claims.

## Execution checklist

1. Load packet context and current assignee/status.
2. Validate ownership and checkout status.
3. Implement with minimal blast radius.
4. Run compile/test proof commands.
5. Post concise evidence comment.
6. Request review gate and set status appropriately.

## References

- `references/governance-gates.md`
- `references/heartbeat-model.md`
- `references/delegation-patterns.md`
