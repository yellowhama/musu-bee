# 2026-06-06 relay fallback candidate coverage gate

Relay fallback route evidence now accepts `candidate_route_kinds` and uses it
to prevent false fallback claims.

New route evidence blockers:

- `relay_route_candidate_set_missing`
- `relay_route_candidate_set_missing_relay_fallback`
- `relay_route_candidate_set_missing_direct_candidate`
- `relay_route_skipped_available_direct_candidate`
- `relay_route_attempted_unavailable_direct_candidate`
- `relay_route_candidate_attempt_order_mismatch`

Validation:

- P2P tests: `111/111`
- typecheck: pass
- P2P store-forward relay audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative evaluation: no high/medium issue found. This is route evidence and
path-selection hardening only; it does not implement second-PC runtime proof or
the release relay tunnel runtime.
