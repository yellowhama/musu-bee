# Risk Notes (MUS-1688 TOKEN_ONLY)

- Trust boundary: packet scope does not modify workspace/company routing or auth trust boundaries.
- Race risk: scope contains CSS/token files and deterministic tests only; no async sync-path mutation.
- Rollback: revert only files listed in `scope_status.txt` using `reconstructable_scope.patch`.
