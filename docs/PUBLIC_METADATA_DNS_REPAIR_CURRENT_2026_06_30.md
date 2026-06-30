# Public Metadata DNS Repair Current State (2026-06-30)

## Verdict

MUSU remains **NO-GO** for the public metadata lane. The latest non-mutating DNS
repair planner confirms the external blocker is still active: canonical
`https://musu.pro` fails request/TLS verification because the apex DNS authority
path still points at Cloudflare records instead of the expected Vercel public
metadata path.

## Evidence

- Planner evidence:
  `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260630-152710-musu-pro-dns-repair-plan-current.json`
- SHA256:
  `7CBE392B2B0678814C470F0BE7D695BE5C7C05BF2127E764683011C6BA71DC36`
- Schema: `musu.public_metadata_dns_repair_plan.v1`
- Generated: `2026-06-30T15:27:11.7382112+09:00`
- `release_blocker_present=true`
- `ready_for_public_metadata_verifier=false`
- `will_mutate_external_dns=false`

## Current DNS/TLS State

| Check | Current | Expected / Required |
|---|---|---|
| DNS provider guess | `cloudflare` | Vercel DNS or Cloudflare external DNS matching Vercel's exact records |
| Nameservers | `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com` | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` if using Vercel DNS |
| Apex A | `104.21.82.53`, `172.67.196.17` | `76.76.21.21` for the current Vercel path |
| Apex AAAA | Cloudflare IPv6 records present | Remove conflicting AAAA unless Vercel explicitly requires them |
| `www` CNAME | missing; `www` resolves through A records | `cname.vercel-dns-0.com` or exact value from `vercel domains inspect` |
| Apex TLS | `ok=false` | `ok=true` |
| `www` TLS | `ok=true` | `ok=true` |
| Direct Vercel edge apex TLS | `ok=false` | `ok=true` |
| Metadata verifier | `ok=false` | `ok=true` |

Failure kinds remain:

- `request_failed`
- `dns_nameserver_mismatch`
- `apex_tls_handshake_failed`
- `vercel_edge_apex_tls_failed`

## Next Action

This lane cannot be closed by local code or evidence generation alone. The next
operator action is external DNS/TLS repair:

1. Run `vercel domains inspect musu.pro --token $env:VERCEL_TOKEN` with a real
   token and use the exact current Vercel recommendation.
2. Choose one authority path: Vercel nameservers, or Cloudflare/third-party DNS
   with Vercel's exact external records.
3. If keeping Cloudflare, replace the apex A with `76.76.21.21`, remove
   conflicting apex A/AAAA/HTTPS records unless Vercel requires them, and set
   `www.musu.pro` CNAME to the Vercel value.
4. Wait for DNS/TLS propagation.
5. Rerun:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

## Product Meaning

This evidence keeps the product claim honest. Public support/privacy/config and
install-channel metadata are not release-grade from the canonical apex until the
verifier passes from current live DNS/TLS.
