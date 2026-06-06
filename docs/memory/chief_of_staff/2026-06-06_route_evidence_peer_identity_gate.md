# 2026-06-06 route evidence peer identity gate

Route evidence release grading now requires top-level peer identity proof to
use `peer_identity_method=quic_tls_cert_fingerprint` and a `sha256:` fingerprint.

Changed:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
- `musu-bee/src/lib/routeEvidenceStore.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

New release blockers:

- `peer_identity_method_not_release_grade`
- `peer_public_key_not_fingerprint`

Validation:

- P2P tests: `108/108`
- typecheck: pass
- P2P relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative evaluation: no high/medium issue found. This is route evidence
integrity hardening only. Second-PC proof, hosted release relay tunnel proof,
support mailbox evidence, and Store evidence remain open.
