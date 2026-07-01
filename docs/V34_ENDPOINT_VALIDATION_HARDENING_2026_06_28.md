# V34 Endpoint Validation Hardening (2026-06-28)

## Status

This is a source hardening update, not a V34 completion claim.

The full product gate remains NO-GO until physical two-node stale
registry/cache/manual-peer evidence is recorded under
`docs/evidence/v34-self-heal/1.15.0-rc.22/` and verified by
`scripts/windows/verify-v34-self-heal-proof.ps1`.

## Finding

The V34 stale self-heal proof verifier already rejected loopback and wildcard
selected candidates, but the endpoint parsing was too loose for edge cases:

- `192.168.1.192:0` could be shaped like a non-loopback host while still being
  unusable because port `0` is not a routable service endpoint.
- `192.168.1.192:-1` could be shaped like a non-loopback host while carrying an
  invalid negative port.
- URL-shaped loopback values such as
  `http://127.0.0.1:4387/api/tasks/delegate` were not parsed as URLs before the
  loopback check.
- IPv4-mapped IPv6 loopback or wildcard values needed normalized IP handling.

That was inconsistent with the product rule that loopback, wildcard, and port
`0` endpoints must never satisfy remote targetability.

## Change

Hardened endpoint parsing in:

- `scripts/windows/verify-v34-self-heal-proof.ps1`
- `scripts/windows/record-v34-self-heal-proof.ps1`
- `scripts/windows/capture-v34-source-snapshot.ps1`

The shared behavior now:

- parses absolute URLs before host checks;
- parses bracketed IPv6 and host:port endpoints;
- rejects port `0`, negative ports, and ports above `65535`;
- rejects path-shaped non-URL endpoint strings;
- normalizes IPv4-mapped IPv6 addresses before loopback/wildcard checks.

Regression coverage was extended in
`scripts/windows/test-release-evidence-verifiers.ps1`:

- `V34 self-heal rejects port-zero selected candidate proof`
- `V34 self-heal rejects negative-port selected candidate proof`
- `V34 self-heal rejects URL loopback selected candidate proof`

## Verification

`scripts/windows/test-release-evidence-verifiers.ps1 -Json` passed:

- `ok=true`
- `case_count=214`
- `failed_case_count=0`
- generated at `2026-06-28T18:33:34.8727514+09:00`

`git diff --check` passed.

## Indexing

`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` completed:

- indexed 3392 files
- indexed 3879 symbols

Recall checks:

- `V34 endpoint validation hardening` returns this report and the roadmap entry.
- `negative-port selected candidate` returns this report.
- `verify-v34-self-heal-proof.ps1` returns the verifier script and regression
  test script.

## Product Impact

This reduces false-positive V34 proof risk. It does not remove the
`v34-stale-self-heal` release blocker because the release lane still requires a
current packaged physical two-node proof with real stale state injected and
healed.
