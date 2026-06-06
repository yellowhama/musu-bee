# Release 1.15.0-rc.1 Relay Fallback Candidate Coverage Gate

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Scope: P2P route evidence, path selection, and relay fallback proof

## Summary

Relay fallback route evidence now has to prove candidate coverage before it can
be considered release-grade.

`relay_fallback` accepts a new optional metadata field:

- `candidate_route_kinds`

For relay route evidence, release grading now blocks records when:

- no candidate route set is supplied
- the candidate set lacks a relay fallback candidate
- no direct candidate exists
- an available direct candidate is skipped before relay fallback
- an attempted direct route kind was not in the candidate set
- the attempted direct route sequence does not match the canonical priority

The canonical direct priority remains:

1. `lan`
2. `tailscale`
3. `direct_quic`
4. relay fallback after direct candidates fail

## Code Changes

Updated:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
- `musu-bee/src/lib/routeEvidenceStore.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

New blockers:

- `relay_route_candidate_set_missing`
- `relay_route_duplicate_candidate_kind`
- `relay_route_candidates_include_failed_kind`
- `relay_route_candidate_set_missing_relay_fallback`
- `relay_route_candidate_set_missing_direct_candidate`
- `relay_route_skipped_available_direct_candidate`
- `relay_route_attempted_unavailable_direct_candidate`
- `relay_route_candidate_attempt_order_mismatch`

## Validation

- P2P tests: `111/111`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

## Qualitative Evaluation

No high or medium issue found.

This is release evidence hardening. It does not implement the second-machine
runtime, and it does not implement the release `quic_relay_tunnel` runtime.
It prevents a false release relay pass where evidence claims fallback after a
single direct attempt while another available direct candidate was skipped.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains the remote input,
project/company room, presence, rendezvous, path-selection, relay fallback, and
evidence/control plane. This change makes the web-assisted P2P bootstrap more
auditable; it does not make MUSU.PRO the default payload execution or data path.

## Next Steps

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_FALLBACK_CANDIDATE_COVERAGE_GATE_2026_06_06.md`
