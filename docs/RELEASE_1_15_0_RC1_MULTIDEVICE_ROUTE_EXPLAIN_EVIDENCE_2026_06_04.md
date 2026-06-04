# MUSU 1.15.0-rc.1 Multi-Device Route Explain Evidence

Date: 2026-06-04
Branch: `harden-relay-fallback-payload-evidence`

## Summary

The multi-device release smoke now records path-selection diagnostics before it
attempts a remote route. The evidence includes `musu.route_explain.v1` from
`musu route --explain --json`, then records the actual `musu.route_evidence.v1`
execution attempt.

This is a P2P evidence-quality hardening step. It does not make a failed or
legacy HTTP bearer route release-grade, but it makes second-PC failures easier
to diagnose because the release evidence now shows the selected candidate,
route kind, submission endpoint, path priority, relay policy, and release-grade
transport requirement before execution.

## Changes

- `scripts/windows/smoke-multidevice-beta.ps1`
  - records `route_explain`
  - runs `musu route "Explain release-smoke route plan..." --target ... --explain --json`
    before the executing route command
- `scripts/windows/verify-multidevice-evidence.ps1`
  - separates route explain commands from executing route commands
  - requires route explain command evidence for release-grade multi-device
    evidence
  - validates `musu.route_explain.v1`, selected candidate, `path_priority`
    order, delegate endpoint, `release_grade_transport_required=quic_tls_1_3`,
    and fallback-only relay policy
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - updates the valid multi-device fixture with route explain evidence
  - adds a regression that rejects missing route explain path-selection evidence
- freshness allowlists now treat multi-device smoke/verifier/recorder tooling
  as status/evidence tooling so existing single-machine and CPU evidence is not
  incorrectly marked stale
- `scripts/windows/prepare-multidevice-test-kit.ps1`
  - second-PC kit README now describes both `musu.route_explain.v1` and
    `musu.route_evidence.v1`

## Observed CLI Diagnostic

Local `musu route --explain --json` against the currently configured
`HUGH-MAIN` peer returns:

- schema `musu.route_explain.v1`
- selected candidate `192.168.1.192:8949`
- route kind `lan`
- transport scheme `http`
- current transport `http_bearer`
- peer identity not verified
- encryption `none_http_bearer`
- path priority `lan -> tailscale -> direct_quic -> relay`
- release-grade transport required `quic_tls_1_3`
- relay policy: Connect/Pro fallback only, not the default data path

That is useful diagnostic evidence but still not release-grade.

## Validation

- PowerShell parser checks passed for touched scripts.
- `git diff --check` passed.
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed with
  `ok=true`, `case_count=25`.
- Runtime CPU scenario matrix verifier still passed with `ok=true`,
  `fail_count=0`.
- Desktop release audit reports `single_machine_verified=true` and
  `multi_device_verified=false`; the only audit failing area is `multi-device`.
- Final go/no-go on `4ed47213` reports:
  - `ready=false`
  - `local=true`
  - `single=true`
  - `multi=false`
  - `msix=true`
  - runtime idle CPU `1/2`
  - runtime CPU matrix `1/2`
  - `p2p=false`
  - `support=false`
  - `store=false`
  - `dirty=false`
  - blockers `6`

## Current Handoff Artifacts

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-132819.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-132834.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-132834.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-132819`

Verification:

- final packet verifier passed with `ok=true`, `fail_count=0`, `kit_count=1`
- action pack verifier passed with `ok=true`, `fail_count=0`

## Release Meaning

This strengthens the second-PC/P2P evidence path but does not close the
multi-device release gate. Public release still needs a current second Windows
PC run that returns release-grade route evidence, second-PC idle CPU evidence,
second-PC runtime CPU scenario matrix evidence, hosted `musu.pro` P2P proof,
support mailbox evidence, and Store evidence.
