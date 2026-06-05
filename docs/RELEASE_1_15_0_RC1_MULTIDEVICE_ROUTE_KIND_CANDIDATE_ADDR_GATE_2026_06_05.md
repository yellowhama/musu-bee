# MUSU 1.15.0-rc.1 Multi-Device Route Kind Candidate Address Gate

Date: 2026-06-05

## Decision

Multi-device release evidence must prove that route classification and route
addresses agree. The hosted route-evidence API already blocks direct-route
claims whose `route_kind` does not match `candidate_addr`; the offline
multi-device verifier now applies the same rule.

## Hardening

Root cause: `verify-multidevice-evidence.ps1` checked that route evidence had a
valid `route_kind` and that `candidate_addr` looked like `host:port`, but it did
not classify the address. A malformed evidence file could claim `route_kind=lan`
while using a public direct-QUIC address.

The verifier now classifies candidate addresses:

- loopback, private, and link-local addresses classify as `lan`
- `100.64.0.0/10` addresses classify as `tailscale`
- public IPs and hostnames classify as `direct_quic`
- relay route evidence is exempt because relay addresses are checked by relay
  proof gates

The rule applies to both:

- `route_explain.selected_candidate.route_kind` versus selected candidate `addr`
- `route_evidence.route_kind` versus `route_evidence.candidate_addr`

## Validation

- PowerShell parser check passed for `verify-multidevice-evidence.ps1` and
  `test-release-evidence-verifiers.ps1`
- `test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
  `case_count=40`, `failed_case_count=0`
- new regression:
  `multidevice rejects route_kind candidate_addr mismatch`
- `git diff --check` passed

## Release State

This hardens evidence integrity only. Public release still requires actual
second-PC current-build route evidence, second-PC idle/runtime CPU matrix
evidence, hosted `musu.pro` P2P release proof, support mailbox proof, and Store
evidence.
