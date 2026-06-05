# 2026-06-06 runtime CPU matrix process metadata gate

Runtime CPU scenario matrix verification now requires scoped process metadata
for every scenario measurement before evidence can count for release.

Code changes:

- `measure-musu-runtime-cpu-scenarios.ps1` carries through
  `process_metadata_available`, `process_metadata_timed_out`, and
  `helper_process_scope`.
- `verify-runtime-cpu-scenario-matrix.ps1` requires process metadata,
  no metadata timeout, scoped helper attribution, and
  `cpu_attribution.attribution_scope=musu_process_tree_or_repo_related`.
- `test-release-evidence-verifiers.ps1` added negative cases for missing
  metadata, timed-out metadata, and unscoped helper attribution.

Fresh evidence:

- full matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- full verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.verification.json`
- targeted HUGH-MAIN CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.target-route.verification.json`

Results:

- release verifier regression `54/54`
- full matrix verifier `ok=true`, `fail_count=0`, `260` checks
- targeted HUGH-MAIN verifier `ok=true`, `fail_count=0`, `65` checks
- old `20260606-054415-HUGH_SECOND` matrix fails the new gate with
  `ok=false`, `fail_count=15`
- targeted HUGH-MAIN route still timed out to `192.168.1.192:8949`; this is CPU
  stability evidence after a failed route attempt, not successful multi-device
  evidence

Product/spec interpretation:

- no change to the local-program/web split
- MUSU Desktop remains the local executor
- MUSU.PRO remains remote input, rooms, rendezvous, path selection,
  relay-fallback policy, and evidence/control coordination
- release CPU evidence now must prove which local process tree was measured

Remaining release blockers are second-PC route/CPU/matrix evidence, hosted
MUSU.PRO P2P proof, support mailbox proof, public metadata recheck, and Store
proof.

