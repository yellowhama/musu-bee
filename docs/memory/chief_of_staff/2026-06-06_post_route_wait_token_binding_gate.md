# 2026-06-06 post-route wait token binding gate

Current release-gate hardening:

- Runtime CPU `post-route` route probes now require non-empty
  `expected_token`.
- Route probe command text must contain `--wait` and the expected token.
- Route probe arguments must bind `--wait` to a prompt containing the expected
  token.
- Successful route probe output must contain the expected token.
- Failed-route diagnostics can still be explicitly allowed, but they must prove
  the wait prompt/token they attempted and must record a numeric non-zero exit
  code.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=77`,
  `failed_case_count=0`
- direct nonnumeric fixture check: `exit_code=1`, `ok=false`, `fail_count=2`;
  verifier returned structured failure JSON instead of throwing

Qualitative assessment:

- This closes another false-positive path in runtime CPU route-attempt
  evidence.
- It does not close the real second-PC route gate.
- Code audit found no high/medium issue after switching failed diagnostic
  `exit_code` parsing to safe numeric validation.
- MUSU Desktop remains the local executor; MUSU.PRO remains remote input,
  rendezvous, path-selection, relay-fallback, and evidence/control plane.
