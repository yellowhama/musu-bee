# MUSU 1.15.0-rc.1 Evidence Verifier Regression Audit

Date: 2026-06-02 08:02 KST
Wiki ID: wiki/538

## Scope

This audit covers the local release evidence verifiers that protect the two
highest-risk remaining technical gates:

- hosted `musu.pro` P2P control-plane evidence
- second-PC multi-device route evidence

It does not create live `musu.pro` or second-PC evidence. The purpose is to
prove that weak or misleading evidence cannot accidentally satisfy the release
gate while the external gates are still pending.

## Change

Added `scripts\windows\test-release-evidence-verifiers.ps1`.

The script generates local synthetic fixtures under
`.local-build\release-evidence-verifier-tests\...`, invokes the real verifier
scripts in separate PowerShell processes, and fails if any case behaves
opposite to its expected result. The result schema is
`musu.release_evidence_verifier_regression.v1`.

`audit-desktop-release-readiness.ps1` now checks that the harness exists, and
the exact harness path is included in the release evidence freshness allowlists
as non-runtime-affecting release-gate tooling.

Validation run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-release-evidence-verifiers.ps1 -Json
```

Result:

- output root:
  `.local-build\release-evidence-verifier-tests\20260602-080146`
- cases: `9`
- failed cases: `0`
- result: `ok=true`

## Verified Behavior

The P2P control-plane verifier accepts only the positive release-grade fixture
and rejects:

- `base_url` not matching `https://musu.pro`
- relay lease owner scope not verified
- relay being marked as the default data path

The multi-device verifier accepts only the positive release-grade direct QUIC
fixture and rejects:

- non-release-grade transport proof
- `route_kind=failed`
- direct route evidence claiming payload transited MUSU infra
- relay route evidence that does not claim payload transited MUSU infra

## Code Audit Interpretation

No new release readiness was claimed. This is a verifier regression guard, not
live evidence.

The current verifier policy remains correct for public release:

- legacy HTTP bearer routing is diagnostic only
- HTTPS fingerprint-pinned bridge routing is diagnostic only
- release-grade multi-device evidence still needs local QUIC/TLS transport
  proof, peer identity proof, successful route result, and truthful payload
  transit semantics
- live hosted P2P evidence still needs owner-scoped relay lease queries from
  `https://musu.pro` with `relay_default_data_path=false`

## Remaining Blockers

Public desktop release remains No-Go until these are recorded:

- second Windows PC runtime idle CPU evidence
- second Windows PC runtime CPU scenario matrix evidence
- release-grade two-machine route evidence
- live `musu.pro` P2P control-plane evidence after KV/relay lease storage is
  configured
- `musu@musu.pro` delivery/forward evidence
- Partner Center / Microsoft Store evidence

## Next Steps

1. Run the current second-PC action pack and import the return zip with
   `-RequireReleaseGateEvidence`.
2. Provision Vercel KV/Upstash for `musu.pro`, set `KV_REST_API_URL` and
   `KV_REST_API_TOKEN`, redeploy, and rerun P2P control-plane evidence without
   `-AllowUnverified`.
3. Record `musu@musu.pro` delivery evidence and Store/Partner Center evidence.
4. Consider wiring `test-release-evidence-verifiers.ps1` into the regular
   Windows release-validation job after the external gates are no longer moving
   every few hours.
