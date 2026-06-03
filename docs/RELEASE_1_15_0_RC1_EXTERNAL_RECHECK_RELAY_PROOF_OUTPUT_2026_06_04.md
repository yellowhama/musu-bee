# MUSU 1.15.0-rc.1 External Recheck Relay Proof Output

Date: 2026-06-04
Wiki: 661

## Summary

The final operator-facing release checks now surface the hosted relay proof
requirements directly instead of burying them inside nested P2P evidence JSON.

This keeps the roadmap decision explicit:

- local MUSU programs do the work on each device
- `musu.pro` coordinates login, rendezvous, fallback connection setup, and
  proof storage
- release-grade relay fallback still requires real payload transport and
  per-record delivery proof
- one-machine evidence can validate local runtime behavior, but second-PC and
  hosted proof gates remain external blockers

## Changes

- `record-p2p-control-plane-evidence.ps1` now returns
  `relay_route_evidence_count` in its final JSON.
- `record-external-release-gate-recheck.ps1` now promotes these fields to the
  top-level evidence, summary, and final JSON:
  - `p2p_relay_route_evidence_count`
  - `p2p_relay_payload_transport_proven`
  - `p2p_relay_payload_delivery_proof_valid_count`
- `record-external-release-gate-recheck.ps1` now adds explicit blockers:
  - `p2p_relay_payload_transport_not_proven`
  - `p2p_relay_payload_delivery_proof_missing`
- `show-final-release-handoff-status.ps1` now includes the same P2P proof
  fields in `gates` and updates the P2P operator step to require production
  KV/Upstash storage, real relay payload transport, and per-record delivery
  proof.

## Validation

- PowerShell parser passed for the touched scripts.
- `git diff --check` passed.
- `test-release-evidence-verifiers.ps1 -Json` passed `24/24`.

## Release Status

This is operator visibility hardening only. Public release remains No-Go until
the remaining external gates are complete: second-PC runtime/multi-device
evidence, live `musu.pro` hosted relay proof with valid delivery proof,
support mailbox evidence, and Store evidence.
