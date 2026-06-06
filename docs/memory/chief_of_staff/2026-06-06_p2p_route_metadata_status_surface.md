# 2026-06-06 P2P route metadata status surface

Current release-gate hardening:

- `record-p2p-control-plane-evidence.ps1` now includes
  `relay_route_metadata_valid_count` in summary and result JSON.
- `write-release-go-no-go.ps1` now surfaces:
  - `p2p_relay_route_metadata_required_count`
  - `p2p_relay_route_metadata_valid_count`
  - `p2p_relay_route_metadata_invalid_count`
- The go/no-go `p2p-control-plane` blocker now explicitly requires
  `relay_route_metadata_valid_count > 0`.
- `show-musu-pro-p2p-env-status.ps1` now exposes route metadata
  valid/required/invalid counts, emits
  `live_evidence_relay_route_metadata_missing`, and gives rerun guidance until
  `relay_route_metadata_valid_count > 0`.
- `record-external-release-gate-recheck.ps1` now flattens
  `p2p_relay_route_metadata_valid_count` and emits
  `p2p_relay_route_metadata_missing`.
- `show-final-release-handoff-status.ps1` forwards
  `p2p_relay_route_metadata_valid_count`.
- Release verifier regression added source-contract coverage for route
  metadata count propagation through release status reports.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=83`,
  `failed_case_count=0`
- dirty-tree go/no-go status smoke: route metadata required/valid/invalid
  counts `0/0/0`
- MUSU.PRO P2P env status smoke: blocker
  `live_evidence_relay_route_metadata_missing`, metadata counts `0/0/0`

Qualitative assessment:

- No high or medium issue found in this scoped status-surface change.
- This closes an operator visibility gap only.
- It does not implement the release relay tunnel, create second-PC proof, or
  change the local-first product split.
- Product boundary remains MUSU Desktop local executor plus MUSU.PRO remote
  input, room, rendezvous, path-selection, relay fallback, and evidence
  control plane.
