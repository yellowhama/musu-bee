# Delegation Patterns

## When to delegate

- External dependency owned by another role/team.
- Access boundary (credentials, host access, deployment ownership).
- Parallelizable work that does not block immediate verification.

## How to delegate

1. Name exact owner (person/agent ID).
2. Name exact unblock action.
3. Attach reproducible evidence of the blocker.
4. State what will happen immediately after unblock.

## Anti-patterns

- "Someone should check this."
- Blocked without named owner.
- Marking done while unresolved external dependency remains.
