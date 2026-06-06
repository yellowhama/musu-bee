# 2026-06-06 external gate root-cause recheck

External release gates were rechecked from clean HEAD
`f0b09139de93cfa98ab1b5d0d8f85e0115fea6b3` after hardening
`record-external-release-gate-recheck.ps1`.

Evidence:

- `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.verification.json`

Key result:

- public metadata checked and ok: `True`
- local artifacts ready: `True`
- single-machine verified: `True`
- second PC TCP error: `tcp_connect_timeout`
- P2P env/evidence verified: `False`
- P2P verification fail count: `40`
- relay status/transport/leases/route-evidence logged in: `False`
- owner scope verified: `False`
- relay lease store configured/release-grade: `False`
- relay transport/connect/payload endpoints wired: `False`
- relay route evidence count: `0`
- relay payload delivery proof valid count: `0`

Recorder changes:

- flattened public metadata, second-PC TCP, logged-in, owner-scope, relay
  lease store, relay endpoint, route-evidence, and payload-proof fields
- added source contract coverage in `test-release-evidence-verifiers.ps1`
- null child JSON inputs now stay evidence-friendly instead of aborting helper
  property reads
- validation passed parser check, `git diff --check`, and release verifier
  regression `55/55`

Interpretation:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous, path
  selection, relay fallback, and evidence control plane.
- Current release blockers are external machine/account/infrastructure
  evidence: second-PC route/CPU/matrix, production P2P login/auth/storage,
  release relay tunnel proof, support mailbox, and Store evidence.
