# Risk Notes (MUS-1688 TOKEN_ONLY)

- Trust boundary: this packet is scoped to CSS token definitions/consumption on `landing-exp`; no workspace/company URL scope-routing logic is changed in the scope patch.
- Race risk: changes are static style/token consumption and test files only; no async synchronization path touched.
- Rollback note: revert the exact files in `scope_status.txt` using the submitted `reconstructable_scope.patch` (or revert the authoritative commit when committed).
