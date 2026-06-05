# 2026-06-05 Route evidence freshness classifier fix

## Debug report

- Symptom: after tightening hosted P2P relay transport gates, clean go/no-go
  unexpectedly dropped `single_machine_verified` to false and runtime CPU
  evidence counts to `0/2`.
- Root cause: `musu-bee/src/lib/routeEvidenceStore.ts` is server-only P2P
  control-plane code, but the release freshness classifiers only allowed
  `musu-bee/src/lib/p2p*.ts`. This made control-plane evidence hardening look
  like a packaged local desktop runtime source change.
- Fix: added `musu-bee/src/lib/routeEvidence*.ts` to the server-only
  control-plane freshness allowlist in single-machine evidence verification,
  runtime CPU matrix verification, and go/no-go aggregation.
- Regression test: `test-release-evidence-verifiers.ps1` now requires that
  classifier needle for all three scripts via
  `Test-ControlPlaneOnlySourceFilesAllowedAsStatusOnly`.
- Evidence: parser checks passed, `git diff --check` passed, release verifier
  regression passed with `ok=true`, `case_count=42`, `failed_case_count=0`, and
  go/no-go recalculated `single_machine_verified=true`, runtime idle CPU `1/2`,
  and runtime CPU matrix `1/2` before commit.
- Localhost note: `127.0.0.1:3001` had no listener, which is expected because
  it is the optional developer dashboard. The installed local bridge remained
  healthy at `127.0.0.1:9422/health` with `status=ok`.
- Status: DONE_WITH_CONCERNS. Public release remains No-Go because second-PC,
  hosted P2P, support mailbox, and Store gates remain open.
