# 2026-06-02 08:02 KST — Release evidence verifier regression harness

- Added `scripts/windows/test-release-evidence-verifiers.ps1` with schema
  `musu.release_evidence_verifier_regression.v1`.
- The harness writes synthetic fixtures under
  `.local-build/release-evidence-verifier-tests/...` and invokes the real
  P2P control-plane and multi-device release verifiers.
- Validation passed 9/9 cases at
  `.local-build/release-evidence-verifier-tests/20260602-080146`:
  positive P2P and multi-device fixtures pass, while fake/weak evidence fails
  for non-`musu.pro` base URL, unverified owner scope, relay default data path,
  non-release-grade transport proof, failed route kind, and false payload
  transit semantics.
- This does not close any live release gate. It only locks the fail-closed
  behavior of local verifiers while second-PC, live `musu.pro` KV-backed P2P,
  support mailbox, and Store evidence remain missing.
