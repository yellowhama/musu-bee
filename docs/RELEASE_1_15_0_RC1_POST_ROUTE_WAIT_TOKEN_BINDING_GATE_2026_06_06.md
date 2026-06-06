# 1.15.0-rc.1 Post-Route Wait Token Binding Gate

Date: 2026-06-06 KST

## Summary

Runtime CPU `post-route` evidence now verifies that the route probe is bound to
the recorded wait prompt and expected token.

The prior target-binding gate ensured that targeted second-PC route-attempt CPU
evidence could not claim one peer while command/arguments pointed at another.
The remaining evidence gap was that a route probe could still trust JSON fields
such as `ok=true` or `failure_allowed=true` without proving that the command
actually waited for the run-specific verifier token.

## Change

`verify-runtime-cpu-scenario-matrix.ps1` now checks `post-route` route probes
for:

- non-empty `expected_token`
- command text containing `--wait` and the expected token
- arguments containing `--wait <prompt-with-token>` or
  `--wait=<prompt-with-token>`
- successful route probe output containing the expected token

Failed-route diagnostics remain allowed only when the caller explicitly enables
the failed-probe path, but the failed probe must still prove which wait prompt
and token were used.

## Validation

- parser checks: pass
- `git diff --check`: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=75`, `failed_case_count=0`
- new negative cases:
  - `runtime matrix rejects route wait prompt without expected token`
  - `runtime matrix rejects successful route probe without token output`

## Release Interpretation

This is evidence hardening, not new second-PC proof.

For release-grade runtime CPU `post-route` evidence, the verifier now requires
the sample to be bound to:

- the route target, when a target is required
- the actual command/arguments
- the wait prompt
- the per-run expected token
- the successful output token, when the probe claims success

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center
proof are recorded.

