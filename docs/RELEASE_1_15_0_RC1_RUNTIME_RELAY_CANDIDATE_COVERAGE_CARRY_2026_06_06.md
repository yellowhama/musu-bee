# Release 1.15.0-rc.1 Runtime Relay Candidate Coverage Carry

Date: 2026-06-06

Status: implemented and source-verified. Public release remains No-Go.

## Summary

The hosted route-evidence gate already required
`relay_fallback.candidate_route_kinds` before a relay route can be considered
release-grade. This change wires the same candidate coverage metadata through
the local MUSU runtime and relay payload queue path.

MUSU.PRO remains the remote input, room, rendezvous, path-selection, relay
fallback, and evidence control plane. MUSU Desktop remains the local executor
and performs the actual route attempts and task execution on each device.

## Runtime Changes

- Rust rendezvous now preserves target candidate route kinds in selected peer
  metadata as `candidate_route_kinds`.
- Rust forward routing now builds an ordered direct candidate list and attempts
  direct candidates before requesting relay fallback.
- Rust `RouteRelayFallbackEvidence` now includes
  `candidate_route_kinds` and preserves it in cloud route evidence submission.
- Relay payload enqueue requests now carry `candidate_route_kinds` and
  `attempted_route_kinds` as metadata.
- Hosted relay payload storage preserves those route metadata fields so
  target-side delivery route evidence can reuse the original fallback proof.
- Target-side relay payload delivery evidence no longer emits the old
  placeholder `attempted_route_kinds=["failed","relay"]`.
- The P2P relay contract audit now checks both web verifier code and Rust
  runtime/source DTOs for this metadata path.

## Validation

- `cargo fmt --check`: pass
- `cargo check --bin musu`: pass, warning-free after cleanup
- `cargo test route_evidence --lib`: 14/14 pass
- `cargo test relay_payload --lib`: 24/24 pass
- `cargo test rendezvous --lib`: 6/6 pass
- `cargo test best_remote_candidate --lib`: 1/1 pass
- `npm run typecheck`: pass
- `npm run test:p2p -- --test-name-pattern "relay payload|route evidence"`:
  111/111 pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=66`,
  `failed_case_count=0`
- `git diff --check`: pass

## Qualitative Audit

No high or medium issue found in this change set.

Strengths:

- The verifier and runtime now agree on the evidence contract.
- The source-to-target relay payload preview path preserves route metadata
  without turning MUSU.PRO into the default payload data path.
- Old or metadata-missing payload records remain non-release-grade instead of
  being upgraded by inference.
- The direct route attempt order is now visible enough for the hosted verifier
  to catch skipped LAN/Tailscale/direct-QUIC candidates.

Residual risks:

- This does not implement the release `quic_relay_tunnel` runtime.
- The store-forward queue remains preview/non-release-grade transport.
- Runtime route source changed, so fresh clean packaged smoke, desktop-open
  CPU, and runtime matrix evidence are required before current source can
  claim packaged local evidence.
- Real second-PC multi-device route proof and hosted release relay proof are
  still missing.

## Release Impact

This closes the runtime evidence carry-path gap introduced by the hosted
candidate coverage gate. It does not close public release gates.

Current remaining public release blockers:

- second-PC multi-device route evidence
- second-PC desktop-open idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO release-grade P2P/relay proof
- release relay tunnel runtime implementation
- support mailbox proof
- Store/Partner Center evidence
