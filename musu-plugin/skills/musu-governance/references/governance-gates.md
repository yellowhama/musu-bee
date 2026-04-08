# Governance Gates

## G1 (Engineering Review)

- Packet moved to `in_review`.
- Compile/test proof command output attached.
- Evidence comment includes:
  - what changed
  - what passed
  - residual risk
- Reviewer or CTO explicitly acknowledges readiness.

## G2 (QA Review)

- G1 is passed.
- User-facing/integration paths are exercised.
- Failures are either fixed or tracked with owner and issue ID.

## G3 (Final Close)

- G1 and G2 passed.
- No unresolved critical/high blocker for packet scope.
- Final close owner confirms acceptance criteria are met.
