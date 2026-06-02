# MUSU 1.15.0-rc.1 Post Relay Store Status Live P2P Evidence

Date: 2026-06-03 06:12 KST

## Scope

This pass refreshed live `musu.pro` P2P control-plane evidence after the relay
lease store status hardening was committed, pushed, and deployed.

The evidence was recorded with the current-source debug CLI instead of the
installed WindowsApps alias so the newly added CLI parsing fields are present in
the artifact.

Command:

```powershell
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -MusuExe .\musu-rs\target\debug\musu.exe -AllowUnverified -Json
```

## Evidence

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.summary.md`
- evidence SHA256:
  `889b16d305cd02dbe3c7894bb58026ebeefd4e76337bea62814f61c130d31ee0`
- verification SHA256:
  `2d9f98f7d1894fdbb358bb07c00d0945c15a33114149104da23b6fe7736e4c63`
- MUSU executable:
  `F:\workspace\musu-bee\musu-rs\target\debug\musu.exe`
- MUSU executable source: `parameter`

## Result

Verification remains failed, as expected:

- `ok=false`
- `fail_count=6`
- `relay_status_logged_in=true`
- `relay_leases_ok=false`
- `owner_scope_verified=false`
- `owner_scoped=false`
- `relay_lease_count=0`
- `relay_default_data_path=false`
- `relay_lease_store_configured=false`
- `relay_lease_store_backend=unconfigured`
- `relay_lease_store_release_grade=false`

The failing checks are:

- `evidence ok`
- `relay leases ok`
- `relay leases owner scope verified`
- `relay leases owner scoped`
- `relay lease store configured`
- `relay lease store release-grade`

The live relay lease error body is preserved by the CLI and evidence artifact:

```text
p2p_relay_lease_kv_not_configured
relay_control_plane_wired=true
relay_transport_wired=false
relay_default_data_path=false
relay_lease_store_configured=false
relay_lease_store_backend=unconfigured
relay_lease_store_release_grade=false
```

## Interpretation

This proves the relay lease store status contract is wired end to end in live
evidence:

1. `musu.pro` returns the storage failure with explicit store status.
2. `musu relay leases --json` preserves the error-body fields.
3. `record-p2p-control-plane-evidence.ps1` writes them into the release
   artifact.
4. `verify-p2p-control-plane-evidence.ps1` fails the evidence because hosted
   release-grade storage is not configured.

This does not close the public P2P gate. It confirms the current blocker is
production storage/provisioning:

- provision Vercel KV or Upstash Redis for the `musu.pro` project
- set `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- redeploy `musu.pro`
- rerun live P2P evidence without `-AllowUnverified`

Relay payload transport is still not implemented. Even after KV/Upstash
owner-scope passes, release-grade relay payload routing must still prove
`relay_transport_wired=true` with actual payload transit evidence before any
`route_kind=relay` claim is public-release acceptable.

## Current Release State

Public desktop release remains No-Go:

- primary/local artifacts are deployable, but current-source evidence changed
  and fresh packaged release evidence must be refreshed before a clean claim
- second-PC route, runtime idle CPU, and runtime CPU matrix evidence remain
  missing or stale
- `musu.pro` P2P owner-scoped relay lease storage is unconfigured
- relay payload transport remains unwired
- `musu@musu.pro` mailbox evidence is still required
- Microsoft Store / Partner Center evidence is still required
