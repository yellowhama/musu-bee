# MUSU Public Metadata DNS Repair Plan (2026-06-28)

## Verdict

The public metadata lane is still **NO-GO**. The site deploy path is not the
current blocker; the canonical `https://musu.pro` apex DNS/TLS path is.

The new planner is intentionally non-mutating:

- Script: `scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1`
- Schema: `musu.public_metadata_dns_repair_plan.v1`
- Evidence:
  `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-160524-musu-pro-dns-repair-plan.json`
- SHA256:
  `3B99B6F35E7E190D9C75B775E4B753568CA1500F2CE7498A1D80CF44173560C8`

## Current Evidence

The planner output reports:

- `release_blocker_present=true`
- `ready_for_public_metadata_verifier=false`
- `will_mutate_external_dns=false`
- `apply_supported=false`
- `can_apply=false`
- `public_metadata_verification.ok=false`
- `failure_kinds=request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`
- DNS provider guess: `cloudflare`
- Current NS: `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`
- Expected NS: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
- Current apex A: `104.21.82.53`, `172.67.196.17`
- Expected apex A: `76.76.21.21`
- Current apex AAAA: `2606:4700:3033::ac43:c411`,
  `2606:4700:3037::6815:5235`
- `apex_tls.ok=false`
- `www_tls.ok=true`
- `vercel_edge_apex_tls_ok=false`
- Latest fail-closed inspect evidence:
  `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-1914-musu-pro-dns-repair-plan-vercel-inspect-fail-closed.json`
- Latest fail-closed inspect SHA256:
  `2FFCFE120EE83BD862220FC9A41ECDD2328FFA47F6F0D6F80BB6AB881781A934`
- With `-RunVercelInspect` and no `VERCEL_TOKEN`, the planner now reports
  `vercel_inspect.ran=false`, `reason=token_missing`, `ok=false`, and
  `has_informative_output=false` instead of running an unauthenticated inspect
  command and preserving a misleading shell/noise output tail.

## Planner Safety Update

`scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1` is now
fail-closed around Vercel inspect:

- no `VERCEL_TOKEN` -> `reason=token_missing`
- nonzero Vercel CLI exit -> `reason=inspect_command_failed`
- zero exit but empty/shell-noise output -> `reason=inspect_output_uninformative`
- useful output must contain a domain/project/DNS/error signal and is marked by
  `has_informative_output=true`

This closes a diagnostic-quality gap only. It does not close the
`store-public-metadata` blocker until canonical `https://musu.pro` verification
passes.

## Repair Paths

Choose one DNS authority path before editing records.

### Path A: Vercel DNS

1. Run `vercel domains inspect musu.pro --token $env:VERCEL_TOKEN`.
2. Migrate any required MX/TXT/mail records out of the current DNS provider.
3. Change the registrar nameservers to `ns1.vercel-dns.com` and
   `ns2.vercel-dns.com`.
4. Wait for propagation.
5. Rerun the planner and the public metadata verifier.

### Path B: Cloudflare Or Third-Party DNS

1. Run `vercel domains inspect musu.pro --token $env:VERCEL_TOKEN` and follow
   the exact Vercel-recommended records for this domain.
2. Set the apex A record to the Vercel apex target, currently expected by the
   planner as `76.76.21.21`.
3. Remove conflicting apex A/AAAA/HTTPS records unless Vercel explicitly
   requires them.
4. Set `www.musu.pro` CNAME to `cname.vercel-dns-0.com` or the exact value from
   `vercel domains inspect`.
5. If Cloudflare proxying remains enabled, verify the Cloudflare SSL/TLS mode
   and certificate behavior do not break Vercel's apex certificate path.
6. Wait for propagation.
7. Rerun the planner and the public metadata verifier.

## Verification Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

The full product spec is not complete until the canonical verifier passes and
the go/no-go output removes the `store-public-metadata` blocker.
