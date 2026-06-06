# 2026-06-06 idle busy-loop candidate count gate

Current release-gate hardening:

- `write-release-go-no-go.ps1` now emits top-level count fields for the idle
  busy-loop candidate matrix.
- The count fields are:
  - `idle_busy_loop_candidate_count`
  - `idle_busy_loop_candidate_verified_count`
  - `idle_busy_loop_candidate_unverified_count`
- The text output also prints `idle_busy_loop_candidate_verified_count: X/Y`.
- `test-release-evidence-verifiers.ps1` now requires these fields in the
  go/no-go source contract.

Validation:

- parser checks: pass
- release evidence verifier regression: `ok=true`, `case_count=77`,
  `failed_case_count=0`
- dirty-tree go/no-go: candidate count `8`, verified `8`, unverified `0`

Qualitative assessment:

- This does not prove new second-PC CPU evidence.
- It makes the existing busy-loop candidate contract easier to audit from the
  go/no-go artifact without expanding the release scope.
- Remaining release blockers are still second-PC CPU/matrix/route evidence,
  live MUSU.PRO P2P control-plane evidence, support mailbox proof, and
  Store/Partner Center proof.
