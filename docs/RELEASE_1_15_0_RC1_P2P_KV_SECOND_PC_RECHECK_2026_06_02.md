# MUSU 1.15.0-rc.1 P2P KV and Second-PC Recheck

**Date**: 2026-06-02 21:58 KST  
**Scope**: current release blockers for hosted `musu.pro` P2P control-plane and second-PC evidence.

## Result

Public desktop release is still **No-Go**.

The current local packaged evidence is healthy, but the two remaining runtime
release blockers did not move:

- hosted `musu.pro` P2P control-plane is wired but cannot verify owner-scoped
  relay lease queries because production KV/Redis is missing
- the last known second-PC LAN target `192.168.1.192:8949` is not reachable
  from `HUGH_SECOND`, so fresh two-machine CPU/route evidence cannot be
  captured from this machine right now

## Hosted P2P Control-Plane Evidence

Fresh evidence:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.summary.md`

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 `
  -MusuExe "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" `
  -BaseUrl https://musu.pro `
  -Version 1.15.0-rc.1 `
  -AllowUnverified `
  -Json
```

Observed:

- `relay_status_exit_code=0`
- `relay_leases_exit_code=0`
- `relay_status.logged_in=true`
- `relay_status.rendezvous_session_wired=true`
- `relay_status.relay_control_plane_lease_wired=true`
- `relay_status.relay_default_data_path=false`
- `relay_leases.ok=false`
- `relay_leases.owner_scope_verified=false`
- error detail:
  `p2p_relay_lease_kv_not_configured`

Verification failed only on the release-critical owner-scope lease checks:

- evidence did not report `ok=true`
- relay leases query did not report `ok=true`
- relay leases owner scope was not verified
- relay leases query was not owner-scoped

Interpretation: the public endpoint is reachable, the runtime token is accepted
far enough to query the relay lease API, rendezvous/lease wiring is present, and
relay is not the default data path. The remaining hosted blocker is production
KV/Redis storage, not default relay behavior.

## Environment Status

`show-musu-pro-p2p-env-status.ps1 -Json` reports:

- GitHub required secret present:
  `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- GitHub required names missing:
  `KV_REST_API_TOKEN`, `KV_REST_API_URL`
- latest live blocker:
  `live_evidence_p2p_relay_lease_kv_not_configured`

Local process/user/machine environment also does not contain:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The repo only has `.env.example`; no local secret-bearing `.env` file is
available to configure production from this machine.

Required operator action remains:

1. Provision Vercel KV / Upstash Redis for the `musu.pro` project.
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` through
   `scripts\windows\configure-musu-pro-p2p-env.ps1`.
3. Deploy `musu.pro`.
4. Rerun `record-p2p-control-plane-evidence.ps1` without
   `-AllowUnverified`.

Do not set relay payload flags or claim relay transport until actual
relay/tunnel payload transport is implemented and verified.

## Second-PC Reachability

The latest Go/No-Go still points at prior failed multi-device evidence for:

- remote name: `HUGH-MAIN`
- remote address: `192.168.1.192:8949`
- route kind attempted: `lan`

Current network probe from `HUGH_SECOND`:

```powershell
Test-NetConnection 192.168.1.192 -Port 8949
```

Observed:

- `TcpTestSucceeded=false`
- ping timed out

Interpretation: the second PC is either offline, on a different IP/port, blocked
by firewall, not running the packaged MUSU runtime, or not exposing the bridge
on that address. No valid two-machine CPU/matrix/route evidence can be produced
until the remote endpoint is reachable or a fresh second-PC return zip is
imported.

## Current Qualitative Assessment

The product is substantially better than the original busy-loop report:

- primary packaged desktop-open idle CPU is under budget on `HUGH_SECOND`
- MUSU-owned Node helpers are `0` in current process ownership evidence
- desktop activation starts/reuses runtime from the installed package
- cloud heartbeat hardware probes no longer spawn PowerShell/WMIC repeatedly
- mDNS/Tailscale IPv6 multicast remains default-disabled and previously
  observed `ff02::fb` failures are not reproduced in current-source checks

Release is still blocked because one-machine health is not enough for this
product. The remaining proof must come from:

- second-PC desktop-open CPU evidence
- second-PC runtime CPU scenario matrix
- release-grade multi-device route evidence with peer identity and transport
  proof
- hosted `musu.pro` owner-scoped P2P control-plane evidence after KV is
  configured
- `musu@musu.pro` mailbox receive/forward evidence
- Microsoft Store/Partner Center evidence
