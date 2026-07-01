# Public Metadata Verifier Timeout Bound (2026-07-01)

## Verdict

The `store-public-metadata` release blocker is still open. DNS/TLS for
`https://musu.pro` still needs external repair.

This update fixes a verifier reliability issue: `verify-store-public-metadata.ps1`
could hang during TLS probing because TCP connect was timeout-bound but
`SslStream.AuthenticateAsClient()` was synchronous. The verifier now bounds TLS
handshake time and returns structured failure evidence instead of blocking the
release go/no-go run.

## What Changed

`scripts/windows/verify-store-public-metadata.ps1::Test-TlsHandshake` now:

- creates `SslStream` with default OS certificate validation;
- calls `AuthenticateAsClientAsync($ServerName)`;
- waits for the same bounded `TimeoutSeconds` used by the TCP probe;
- returns `failure_kind="tls_handshake_timeout"` on handshake timeout;
- returns `failure_kind="tls_handshake_canceled"` if the async handshake is
  canceled;
- preserves existing `tls_handshake_failed` behavior for handshake exceptions.

This keeps the verifier diagnostic-only. It does not mutate DNS, Vercel,
Cloudflare, or any hosted setting.

## Evidence

Parser check:

- `parse_error_count=0` for
  `scripts/windows/verify-store-public-metadata.ps1`.

Direct public metadata verifier recheck:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -TimeoutSec 3 -Json`
- result: returned in about 5.5s with `ok=false`
- failure kinds:
  `request_failed`, `dns_configuration_mismatch`,
  `dns_nameserver_mismatch`, `apex_tls_handshake_failed`,
  `vercel_edge_apex_tls_failed`
- DNS/TLS facts remain:
  - current nameservers:
    `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`
  - expected nameservers:
    `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
  - apex A records still point to Cloudflare, not `76.76.21.21`
  - apex AAAA records are still present
  - `www_tls.ok=true`
  - apex TLS and direct Vercel edge apex TLS still fail

Clean go/no-go recheck after commit:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -ScriptTimeoutSeconds 180 -Json`
- generated: `2026-07-01T02:06:27.0080512+09:00`
- result: completed in `81216ms`
- `verify-store-public-metadata.ps1` invocation completed in `4493ms`
- `timed_out=false`, `json_returned=true`, `exit_code=1`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blocker_count=11`
- `manifest_git.dirty=false`

## Product Meaning

The blocker did not close. The improvement is that release go/no-go can now
surface the public metadata failure quickly instead of hanging while probing
TLS.

This is movement toward the roadmap because the public metadata lane now has a
bounded diagnostic verifier. The next real closure step remains external DNS/TLS
repair followed by a clean `verify-store-public-metadata.ps1 -BaseUrl
https://musu.pro -Json` pass.

## Next Steps

1. Repair one accepted DNS path for `musu.pro`: Vercel nameservers, or exact
   Vercel external DNS records with no conflicting apex AAAA records.
2. Re-run public metadata verification and go/no-go after DNS/TLS changes.
