# Public Metadata Vercel Inspect Fail-Closed Update (2026-06-28)

## Verdict

The public metadata lane is still **NO-GO**. This update does not repair
external `musu.pro` DNS/TLS. It fixes a local operator-diagnostic hazard in the
DNS repair planner: `-RunVercelInspect` no longer runs Vercel inspect without a
token, and an inspect command that returns no useful domain/project/DNS signal
is no longer treated as clean.

## Changed

- `scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1`
  - If `-RunVercelInspect` is set but `VERCEL_TOKEN` is missing, the planner now
    returns `vercel_inspect.ran=false`, `reason=token_missing`, `ok=false`, and
    `has_informative_output=false`.
  - If the Vercel command runs but exits nonzero, the planner reports
    `reason=inspect_command_failed`.
  - If the command exits zero but output is empty or only shell noise, the
    planner reports `reason=inspect_output_uninformative`.
  - Token text is still redacted from command output.
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - The source contract now requires `token_missing`,
    `inspect_command_failed`, `inspect_output_uninformative`, and
    `has_informative_output` in the planner.

## Evidence

- Planner evidence:
  `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-1914-musu-pro-dns-repair-plan-vercel-inspect-fail-closed.json`
- SHA256:
  `2FFCFE120EE83BD862220FC9A41ECDD2328FFA47F6F0D6F80BB6AB881781A934`
- Planner run:
  - `release_blocker_present=true`
  - `ready_for_public_metadata_verifier=false`
  - `public_metadata_verification.ok=false`
  - `failure_kinds=request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`
  - `vercel_inspect.ran=false`
  - `vercel_inspect.reason=token_missing`
  - `vercel_inspect.ok=false`
  - `vercel_inspect.has_informative_output=false`
- Regression:
  `scripts/windows/test-release-evidence-verifiers.ps1 -Json`
  returned `ok=true`, `case_count=214`, `failed_case_count=0` at
  `2026-06-28T19:12:49.6810461+09:00`.

## Code Audit

This is a diagnostic hardening change only. It does not touch DNS providers,
Vercel project state, Cloudflare state, application routes, package artifacts,
or Store evidence. The planner remains non-mutating:

- `will_mutate_external_dns=false`
- `apply_supported=false`
- `can_apply=false`

The remaining public metadata repair still requires an operator/provider action:
fix the canonical apex DNS/TLS path, then rerun
`verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`.

## Next

1. Provide a valid Vercel token in the operator environment and run:
   `vercel domains inspect musu.pro --token $env:VERCEL_TOKEN`.
2. Choose one DNS authority path: Vercel DNS nameservers or exact external DNS
   records at the current provider.
3. Repair apex `https://musu.pro` TLS/certificate path.
4. Rerun:
   `scripts/windows/verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`.
5. Rerun:
   `scripts/windows/write-release-go-no-go.ps1 -Json`.

