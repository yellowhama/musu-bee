# 2026-06-07 Second-PC Route Reachability Handoff

## Decision

Connect route reachability diagnostics to the real second-PC operator handoff
path instead of leaving the recorder/verifier as standalone tools.

## Change

- `run-second-pc-release-check.ps1` now records route reachability diagnostics
  when a target peer is supplied.
- Second-PC return zips can include
  `.local-build\route-diagnostics\*.route-reachability-diagnostic.json`.
- `import-second-pc-return.ps1` copies and verifies returned diagnostics with
  non-local target enforcement when the release-check required them.
- Multi-device kit, final operator packet, operator action pack, and their
  verifiers now include route reachability tools and instructions.
- Release verifier regression added source-contract cases for wrapper,
  importer, and kit handoff coverage.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO is remote input, project room,
meeting room, presence, rendezvous, path-selection, relay fallback, and evidence
control plane. It does not execute local work or replace P2P/direct local
execution.

## Validation

- Parser checks passed.
- Release verifier regression passed with `ok=true`, `case_count=93`,
  `failed_case_count=0`.

## Audit Result

No high/medium issue was found. This is handoff and evidence plumbing only.
Public release still needs real second-PC route/CPU/matrix, hosted MUSU.PRO
P2P/relay proof, support mailbox proof, and Store proof.
