# MUSU 1.15.0-rc.1 External Gate Recheck

Date: 2026-06-03 04:30 KST

## Summary

Current HEAD `c7b0d599` remains a public desktop release No-Go, but the local
artifact path is clean:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- `msix_install_verified=True`
- `msix_desktop_entrypoint_verified=True`
- `process_ownership_verified=True`
- `startup_single_instance_verified=True`
- `desktop_single_instance_verified=True`
- `public_metadata_ok=True`

Remaining blockers are external or two-machine gates:

- second-PC route evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- live `musu.pro` owner-scoped relay lease evidence
- `musu@musu.pro` mailbox delivery evidence
- Partner Center reservation/submission/certification evidence

## Second-PC Reachability

Command:

```powershell
Test-NetConnection 192.168.1.192 -Port 8949
```

Result:

- `InterfaceAlias=이더넷 2`
- `SourceAddress=192.168.1.154`
- `PingSucceeded=False`
- `TcpTestSucceeded=False`

The second PC is still unreachable from the primary machine, so release-grade
two-machine route/CPU/matrix evidence cannot be captured yet.

## Live P2P Control-Plane Evidence

Fresh evidence was recorded using the explicit packaged WindowsApps alias:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -MusuExe "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" -AllowUnverified -Json
```

Evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.verification.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.summary.md`

Hashes:

- evidence SHA256:
  `127beaa91f1f8e9b5c03b97ebdddcd4ffa9c551d104eabbeefbf5bba68563859`
- verification SHA256:
  `bde1e2780bd02a4aa8423e01e53cdb11da58d1f26c371a131c77494ae77a41c3`

Verification result:

- `ok=false`
- `fail_count=4`
- relay status logged in: `true`
- bridge path selection wired: pass
- rendezvous session wired: pass
- route evidence client wired: pass
- relay lease control-plane wired: pass
- relay runtime fallback lease request wired: pass
- release transport requirement: `quic_tls_1_3`
- `relay_default_data_path=false`
- relay leases ok: `false`
- owner scope verified: `false`
- owner scoped: `false`

Live error detail:

```text
p2p_relay_lease_kv_not_configured
```

## P2P Env Status

`show-musu-pro-p2p-env-status.ps1 -Json` still reports:

- present: `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- missing:
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- missing:
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`

Next action is not another code change. Provision Vercel KV / Upstash Redis for
`musu.pro`, set either the KV names or Upstash REST names, deploy/reload
production, then rerun the P2P evidence recorder without `-AllowUnverified`.

## Qualitative Assessment

The current desktop is good enough for local release-candidate testing but not
for public release:

- CPU busy-loop: not reproduced on the primary machine; still unproven on
  second PC.
- P2P: path-selection/control-plane wiring is present, but live relay lease
  storage is not configured and owner scope is not proven.
- Hardening: local process ownership, startup/single-instance, MSIX install,
  and package entrypoint gates pass.
- Store readiness: package artifacts and public metadata are ready; mailbox and
  Partner Center evidence are still missing.

## Next Steps

1. Make the second PC reachable or import a fresh second-PC return zip.
2. Capture clean/current second-PC MSIX install, route, idle CPU, and CPU matrix
   evidence.
3. Configure `musu.pro` KV/Upstash production storage and redeploy.
4. Rerun P2P control-plane evidence without `-AllowUnverified`.
5. Record `musu@musu.pro` mailbox delivery evidence.
6. Record Partner Center product reservation/submission/certification evidence.
