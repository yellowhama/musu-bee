# 2026-06-06 P2P route metadata count completeness

Current release-gate hardening:

- `record-p2p-control-plane-evidence.ps1` now prints and returns the full
  route metadata count triplet:
  - `relay_route_metadata_required_count`
  - `relay_route_metadata_valid_count`
  - `relay_route_metadata_invalid_count`
- `record-external-release-gate-recheck.ps1` now flattens:
  - `p2p_relay_route_metadata_required_count`
  - `p2p_relay_route_metadata_valid_count`
  - `p2p_relay_route_metadata_invalid_count`
- `show-final-release-handoff-status.ps1` forwards the same three go/no-go
  fields.
- `test-release-evidence-verifiers.ps1` strengthens the route metadata status
  source contract so recorder, external recheck, and final handoff retain the
  full count triplet.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=83`,
  `failed_case_count=0`

Qualitative assessment:

- No high or medium issue found.
- This is diagnostic hardening only.
- It does not implement release relay runtime, second-PC proof, support
  mailbox proof, or Store proof.
- Product boundary remains MUSU Desktop local executor plus MUSU.PRO remote
  input, room, rendezvous, path-selection, relay fallback, and evidence
  control plane.
