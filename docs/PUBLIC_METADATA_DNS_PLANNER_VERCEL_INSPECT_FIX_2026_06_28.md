# Public Metadata DNS Planner Vercel Inspect Fix (2026-06-28)

## Summary

The product remains **NO-GO** for public metadata. The canonical
`https://musu.pro` apex path still fails DNS/TLS verification, but the DNS repair
planner now captures real Vercel domain inspect output when a token is present.

This fixes a tooling bug in the operator path. It does not mutate DNS and does
not close the `store-public-metadata` lane.

## What Changed

`scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1` used `$args` as a
local array inside `Invoke-VercelInspect`. In PowerShell, `$args` is an automatic
variable, and the script could invoke `npx` without the intended Vercel CLI
arguments. The result was a misleading `inspect_output_uninformative` record even
when `VERCEL_TOKEN` was present.

The script now uses `$vercelArgs` and executes:

```powershell
npx -y vercel@54.7.1 domains inspect musu.pro --token $env:VERCEL_TOKEN
```

The regression contract in `scripts/windows/test-release-evidence-verifiers.ps1`
now checks this invocation shape.

## Evidence

Latest fixed planner evidence:

- `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-204816-musu-pro-dns-repair-plan-vercel-inspect-fixed.json`
- SHA256:
  `B8709AC9CA39173806D9F7577B05227553E974934E4E363CED24611C0ACEE1C3`

That evidence records:

- `vercel_inspect.ran=true`
- `vercel_inspect.ok=true`
- `vercel_inspect.has_informative_output=true`
- Vercel project binding: `musu-pro`
- Vercel intended nameservers: `ns1.vercel-dns.com`,
  `ns2.vercel-dns.com`
- Current nameservers: `blakely.ns.cloudflare.com`,
  `weston.ns.cloudflare.com`
- `ready_for_public_metadata_verifier=false`

Verification:

- `npm run test:public-release` passed 16 tests.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` returned
  `ok=true`, `case_count=214`, `failed_case_count=0`.

## Product Meaning

This makes the public metadata repair path more accurate. The blocker itself is
external: the domain is assigned to Vercel, but the live authority path still
uses Cloudflare nameservers and the apex TLS handshake fails from this machine.

The next real closure action is still DNS/TLS repair, then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

## Related Kit Refresh

A fresh second-PC kit was generated from clean commit
`8e82fae46eb25b59171627627cab5dcfba7e847f`:

- `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-204644.zip`
- SHA256:
  `6718085a3765f6159e1f9571974e477f343a5825c536d99267d86335b22d0396`

This only refreshes the handoff artifact. It does not close the second-PC,
runtime CPU, or release-grade multi-device route blockers until `hugh-main`
runs the kit and returns verifier-passing evidence.
