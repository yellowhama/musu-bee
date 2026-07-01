# Public Metadata DNS Path Mode Fix - 2026-06-30

## Summary

The `store-public-metadata` blocker is still open. Current live `https://musu.pro`
does not satisfy either accepted DNS path:

1. Vercel authoritative DNS: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`.
2. External DNS path: apex `A=76.76.21.21`, no apex `AAAA`, and
   `www.musu.pro CNAME=cname.vercel-dns-0.com`.

This change fixes the verifier/planner contract so both paths are represented
explicitly. It does not mutate DNS and does not close the release blocker.

## Code Changes

- `scripts/windows/verify-store-public-metadata.ps1`
  - Added `ExpectedApexARecords` and `ExpectedWwwCname`.
  - DNS diagnostics now report:
    - `external_dns_records_match_expected`
    - `dns_path_matches_expected`
    - `apex_aaaa_records_absent`
    - `www_cname_matches_expected`
  - Failure kinds now include `dns_configuration_mismatch` when neither accepted
    DNS path is valid. The legacy `dns_nameserver_mismatch` remains present for
    the current bad state because nameservers are mismatched and external DNS
    records are also not valid.

- `scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1`
  - `needsDnsRepair` now checks `dns_path_matches_expected`, not only Vercel
    nameserver delegation.
  - The planner continues to be non-mutating and still requires a human/provider
    DNS repair before the public metadata verifier can pass.

- `scripts/windows/test-release-evidence-verifiers.ps1`
  - Source contract tests now require the DNS path fields and path-mode logic.

## Fresh Evidence

Source HEAD before this change:
`e1e8bf691e7ea84cecb865c937f8f52b06325aac`.

Planner evidence:
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260630-235400-musu-pro-dns-repair-plan-path-mode.json`

Planner summary:

- `release_blocker_present=true`
- `ready_for_public_metadata_verifier=false`
- `provider_guess=cloudflare`
- `nameserver_matches_expected=false`
- `external_dns_records_match_expected=false`
- `dns_path_matches_expected=false`
- `apex_a_matches_expected=false`
- `apex_aaaa_records_absent=false`
- `www_cname_matches_expected=false`
- `apex_tls.ok=false`
- `www_tls.ok=true`
- `vercel_inspect.ok=true`
- `cloudflare.token_status.valid=false`

Verifier summary after the code change:

- `ok=false`
- `fail_count=3`
- `failure_kinds=request_failed,dns_configuration_mismatch,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`
- `dns_diagnostics.provider_guess=cloudflare`
- `dns_diagnostics.dns_path_matches_expected=false`

Validation:

- PowerShell parser passed for the three changed scripts.
- `scripts/windows/test-release-evidence-verifiers.ps1` passed.
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `3526 files` and `3907 symbols`; search for
  `dns_path_matches_expected external_dns_records_match_expected public metadata`
  returns this document, the current-state DNS repair doc, and `docs/WIKI.md`.

## Product Spec Status

This improves release tooling accuracy only. The full product spec is still
No-Go for public release because canonical public metadata cannot be verified
until the external DNS/TLS path is repaired and
`verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` passes.

## Next Step

Repair DNS at the provider:

- Either move authoritative nameservers to Vercel DNS.
- Or keep Cloudflare/third-party DNS and set the exact Vercel external records:
  apex `A=76.76.21.21`, remove conflicting apex `AAAA`, and set
  `www.musu.pro CNAME=cname.vercel-dns-0.com`.

Then rerun:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```
