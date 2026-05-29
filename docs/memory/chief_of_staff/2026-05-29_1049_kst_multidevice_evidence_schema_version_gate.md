# 2026-05-29 10:49 KST - Multi-Device Evidence Schema Version Gate

## Change

Multi-device release evidence is now schema, version, timestamp, and freshness
gated.

Updated scripts:

- `scripts\windows\smoke-multidevice-beta.ps1`
- `scripts\windows\verify-multidevice-evidence.ps1`
- `scripts\windows\record-multidevice-evidence.ps1`
- `scripts\windows\audit-desktop-release-readiness.ps1`
- `scripts\windows\verify-final-operator-gate-packet.ps1`

## Current Rule

`smoke-multidevice-beta.ps1` writes `musu.multidevice_smoke_evidence.v1` with
the current repo `VERSION`, operator machine/user, `started_at`, and
`completed_at`.

`verify-multidevice-evidence.ps1` requires:

- schema `musu.multidevice_smoke_evidence.v1`
- expected version when `-ExpectedVersion` is supplied
- parseable `started_at` and `completed_at`
- acceptable evidence age
- operator machine metadata
- required command log and zero exit status
- route output unless `-AllowStatusOnly` is explicitly used

The release audit passes the repo `VERSION` into the verifier, and final packet
verification rejects stale packets whose bundled multi-device verifier lacks the
schema/version/completion-time checks.
