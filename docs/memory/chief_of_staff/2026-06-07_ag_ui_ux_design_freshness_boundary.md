# 2026-06-07 AG UI/UX Design Freshness Boundary

Clean go/no-go after commit `6c03729c` showed
`runtime_idle_cpu_valid_machine_count=0` even though the new AG UI/UX work was
documentation-only.

Root cause:

- root/app `DESIGN.md` files are not in the runtime evidence freshness
  allowlist;
- changing them caused the release gate to treat current desktop-open idle CPU
  evidence as stale;
- `docs\` changes are allowed as documentation/evidence/status-only deltas.

Decision:

- keep the canonical AG UI/UX design in
  `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`;
- do not update root/app `DESIGN.md` while preserving packaged runtime evidence
  freshness;
- avoid broadening freshness allowlists unless a source-contract test is added.

This preserves the release boundary: design documentation can progress without
claiming new runtime evidence, and root-level design-system changes require
fresh local evidence or explicit verifier allowlist work.
