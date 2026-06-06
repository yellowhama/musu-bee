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
- failed route diagnostics using a numeric non-zero exit code

Failed-route diagnostics remain allowed only when the caller explicitly enables
the failed-probe path, but the failed probe must still prove which wait prompt
and token were used. A zero-exit command or nonnumeric diagnostic value that
merely lacks the expected token is no longer accepted as a failed route attempt.

## Validation

- parser checks: pass
- `git diff --check`: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=77`, `failed_case_count=0`
- new negative cases:
  - `runtime matrix rejects allowed failed route attempt with zero exit code`
  - `runtime matrix rejects allowed failed route attempt with nonnumeric exit code`
  - `runtime matrix rejects route wait prompt without expected token`
  - `runtime matrix rejects successful route probe without token output`
- direct nonnumeric fixture check: `exit_code=1`, `ok=false`,
  `fail_count=2`; failed checks include `post-route failed route probe exit
  code`

## Code Audit

No high or medium issue found in this scoped verifier change.

The initial exit-code hardening was tightened during audit so malformed
`route_probe.exit_code` values are parsed safely. A bad value now produces
structured verifier failure JSON instead of relying on a PowerShell cast
exception. The zero-exit and nonnumeric-exit regression cases require parsed
JSON output from the verifier.

## Release Interpretation

This is evidence hardening, not new second-PC proof.

For release-grade runtime CPU `post-route` evidence, the verifier now requires
the sample to be bound to:

- the route target, when a target is required
- the actual command/arguments
- the wait prompt
- the per-run expected token
- the successful output token, when the probe claims success
- a numeric non-zero exit code, when the probe claims an explicitly allowed failure

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center
proof are recorded.

## Next Steps

1. Capture real second-PC runtime CPU matrix and targeted route-attempt CPU
   evidence with the stricter post-route contract.
2. Record live MUSU.PRO control-plane P2P/relay evidence proving remote input,
   rendezvous/path selection, and relay fallback without making MUSU.PRO the
   executor/default payload path.
3. Finish support mailbox and Store/Partner Center evidence before changing
   public release status.
