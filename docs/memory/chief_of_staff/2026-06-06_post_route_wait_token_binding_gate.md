# 2026-06-06 post-route wait token binding gate

Current release-gate hardening:

- Runtime CPU `post-route` route probes now require non-empty
  `expected_token`.
- Route probe command text must contain `--wait` and the expected token.
- Route probe arguments must bind `--wait` to a prompt containing the expected
  token.
- Successful route probe output must contain the expected token.
- Failed-route diagnostics can still be explicitly allowed, but they must prove
  the wait prompt/token they attempted.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=75`,
  `failed_case_count=0`

Qualitative assessment:

- This closes another false-positive path in runtime CPU route-attempt
  evidence.
- It does not close the real second-PC route gate.
- MUSU Desktop remains the local executor; MUSU.PRO remains remote input,
  rendezvous, path-selection, relay-fallback, and evidence/control plane.

