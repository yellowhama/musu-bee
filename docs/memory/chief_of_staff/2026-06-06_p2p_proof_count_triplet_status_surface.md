# 2026-06-06 P2P proof count triplet status surface

Current release-gate hardening:

- `record-p2p-control-plane-evidence.ps1` now records route transport proof
  and payload delivery proof required/valid/invalid count triplets.
- `write-release-go-no-go.ps1` now exposes:
  - `p2p_relay_route_transport_proof_required_count`
  - `p2p_relay_route_transport_proof_valid_count`
  - `p2p_relay_route_transport_proof_invalid_count`
  - `p2p_relay_payload_delivery_proof_required_count`
  - `p2p_relay_payload_delivery_proof_valid_count`
  - `p2p_relay_payload_delivery_proof_invalid_count`
- `record-external-release-gate-recheck.ps1` and
  `show-final-release-handoff-status.ps1` now carry the same triplets.
- Release verifier regression added source-contract case
  `P2P proof count triplets surface through release status reports`.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=84`,
  `failed_case_count=0`
- dirty-tree go/no-go status smoke: route transport proof and payload delivery
  proof triplets are `0/0/0`

Qualitative assessment:

- No high or medium issue found.
- This is diagnostic hardening only.
- It does not implement release relay runtime, second-PC proof, support
  mailbox proof, or Store proof.
- Product boundary remains MUSU Desktop local executor plus MUSU.PRO remote
  input, room, rendezvous, path-selection, relay fallback, and evidence
  control plane.
