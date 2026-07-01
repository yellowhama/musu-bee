# V34 Source Artifact Path/Type Hardening (2026-06-30)

## Verdict

The V34 stale self-heal lane is still **NO-GO** because physical two-node
stale registry/cache/manual-peer proof is still missing. This change tightens
the verifier so future V34 proof cannot omit the canonical source artifact
paths or pass with non-operator source artifact types.

## Changed Contract

`scripts/windows/verify-v34-self-heal-proof.ps1` now requires:

- `source_evidence.ttl_source_evidence_path`
- `source_evidence.boot_source_evidence_path`
- `source_evidence.ttl_source_evidence.source_type = operator_snapshot_pair`
- `source_evidence.boot_source_evidence.source_type = operator_snapshot_pair`

This matches the intended recorder flow:

1. Capture physical before/after snapshots with
   `capture-v34-source-snapshot.ps1`.
2. Bind those snapshots with `record-v34-source-artifacts.ps1`.
3. Feed the resulting TTL/boot source artifact paths into
   `record-v34-self-heal-proof.ps1`.
4. Verify the final wrapper with `verify-v34-self-heal-proof.ps1`.

## Regression Coverage

`scripts/windows/test-release-evidence-verifiers.ps1` now includes two new
negative cases:

- `V34 self-heal rejects proof without source artifact paths`
- `V34 self-heal rejects non-operator source artifact type`

The existing valid V34 fixture and recorder fixture now include
`source_type = operator_snapshot_pair`.

## Verification

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json
```

Result at `2026-06-30T15:51:23.0566768+09:00`:

- `ok=true`
- `case_count=216`
- `failed_case_count=0`
- output root:
  `.local-build\release-evidence-verifier-tests\20260630-154819`

## Product Claim

Allowed:

- "V34 source artifact verifier is stricter and rejects missing source artifact
  paths or non-operator source types."
- "The V34 physical proof lane remains open."

Not allowed:

- "V34 stale self-heal is complete."
- "The full product is complete."
