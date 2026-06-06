# 1.15.0-rc.1 Second-PC Route-Attempt Local Target Gate

Date: 2026-06-06 KST

## Summary

Targeted second-PC route-attempt CPU evidence now rejects localhost and loopback
targets. A `post-route` CPU matrix can no longer satisfy the targeted
second-PC diagnostic gate by routing to `localhost`, `127.0.0.1`, `::1`, or a
local-only alias while `-AllowFailedPostRouteProbe` is enabled.

This closes a false-positive gap in the idle CPU / route-attempt evidence path:
the diagnostic may allow a failed route attempt for CPU attribution, but it
must still be a real non-local target attempt.

## Changed

- `verify-runtime-cpu-scenario-matrix.ps1` adds
  `-RejectLocalPostRouteTarget`.
- The verifier normalizes route targets that are URLs, `host:port`, bracketed
  IPv6, or plain hostnames before classifying them.
- Local-only targets are rejected for second-PC route-attempt evidence:
  - `localhost`
  - `*.localhost`
  - `localhost.localdomain`
  - `127.0.0.0/8`
  - `::1`
  - `0.0.0.0`
  - `host.docker.internal`
- `write-release-go-no-go.ps1` now passes `-RejectLocalPostRouteTarget` when
  verifying `runtime_cpu_second_pc_route_attempt_*` evidence.
- `test-release-evidence-verifiers.ps1` adds source-contract coverage and the
  negative fixture `runtime matrix rejects localhost second-PC route attempt`.

## Validation

- PowerShell parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression:
  - `ok=true`
  - `case_count=82`
  - `failed_case_count=0`
  - output root:
    `.local-build\release-evidence-verifier-tests\20260606-223210`
- direct remote-target failed diagnostic fixture with
  `-RejectLocalPostRouteTarget`:
  - `ok=true`
  - `fail_count=0`
- direct local-target fixture `127.0.0.1:2751`:
  - `ok=false`
  - `fail_count=1`

## Qualitative Code Audit

No high or medium issue was found in this scoped verifier/go-no-go change.

The implementation is fail-closed for empty or local-only targets and does not
change normal full runtime CPU matrix verification. The stricter target
rejection is only used by the targeted second-PC route-attempt diagnostic gate.

## Release Interpretation

This is evidence hardening only. It does not create second-PC evidence and does
not make a failed route attempt release-grade multi-device proof.

Public release remains No-Go until:

- real second-PC route evidence is recorded
- runtime idle CPU evidence passes on two machines
- runtime CPU scenario matrix evidence passes on two machines
- live MUSU.PRO P2P/relay evidence is recorded
- support mailbox proof is recorded
- Store/Partner Center proof is recorded
