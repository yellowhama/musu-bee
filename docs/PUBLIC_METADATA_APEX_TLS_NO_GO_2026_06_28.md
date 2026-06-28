# Public Metadata Apex TLS NO-GO (2026-06-28)

## Summary

`https://musu.pro` is still a product-spec blocker for the current `1.15.0-rc.22`
release gate. The latest failure is not a privacy/support page content mismatch.
From `HUGH_SECOND`, the canonical apex host resets the TLS handshake before the
public metadata verifier can fetch `/privacy`, `/support`, or
`/api/public-config`.

The product cannot be called complete while this remains true, because the
installer, fleet proof, public config, support page, privacy page, and Store
metadata all use `https://musu.pro` as the canonical public surface.

## Evidence

Local verifier:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -Json`
- Time: `2026-06-28T10:49:04+09:00`
- Result: `ok=false`, `fail_count=3`, `failure_kinds=request_failed`.
- Failed URLs: `https://musu.pro/privacy`, `https://musu.pro/support`,
  `https://musu.pro/api/public-config`.
- Error text: localized Windows message equivalent to "the underlying
  connection was closed; an unexpected error occurred on send."

TLS/client split:

- `curl.exe -4 -L -I --http1.1 --max-time 20 https://musu.pro/privacy`
  returns `curl: (35) Recv failure: Connection was reset`.
- `curl.exe -4 -v --http1.1 --max-time 20 https://musu.pro/privacy` shows the
  reset during the TLS handshake before HTTP response headers are received.
- `curl.exe -4 -v --http1.1 --connect-to www.musu.pro:443:104.21.82.53:443 https://www.musu.pro/privacy`
  completes TLS and receives `HTTP/1.1 307 Temporary Redirect` to
  `https://musu.pro/privacy`.

DNS/domain control:

- `Resolve-DnsName musu.pro -Type NS` reports Cloudflare nameservers:
  `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`.
- `npx -y vercel@54.7.1 domains inspect musu.pro --token <redacted>` reports
  domain `musu.pro` attached to project `musu-pro`, but intended nameservers are
  `ns1.vercel-dns.com` and `ns2.vercel-dns.com`, while current nameservers are
  the Cloudflare pair above.
- `F:\Aisaak\Projects\yellow.txt` has a Vercel token section but no Cloudflare
  token/section was found, so this repo agent can inspect Vercel but cannot
  repair Cloudflare edge certificate or DNS settings directly.

## System Design Finding

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Canonical public host `https://musu.pro` is not reachable from the local release verifier because apex TLS resets during handshake. | PowerShell verifier fails `request_failed`; `curl.exe` fails before headers on apex HTTPS; `www.musu.pro` TLS succeeds only long enough to redirect back to the failing apex. | Public metadata, install channel, support/privacy, and Store metadata proof cannot be considered release-grade from current local evidence. | Domain owner must repair apex HTTPS at Cloudflare/Vercel: either make Cloudflare edge SSL cover `musu.pro` correctly while routing to Vercel, or move authoritative DNS to Vercel as Vercel currently expects. Then rerun `verify-store-public-metadata.ps1 -Json` and `write-release-go-no-go.ps1 -Json`. |

## Next Steps

1. In Cloudflare or registrar DNS, decide the authority model for `musu.pro`:
   keep Cloudflare authoritative and fix the apex edge certificate/routing, or
   move nameservers to Vercel DNS.
2. Verify apex HTTPS directly from this machine:
   `curl.exe -4 -L -I --http1.1 https://musu.pro/privacy`.
3. Rerun:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -Json`.
4. Rerun:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json`.
5. Only when `public_metadata_ok=true` can the public metadata blocker be
   removed from the full product spec completion claim.
