# MUSU 1.15.0-rc.1 Multi-Device Release Test Plan

**Wiki ID**: wiki/519
**Date**: 2026-05-29
**Scope**: Two Windows machines on the same LAN/Tailscale segment, current MUSU beta runtime, manual peer add fallback, dashboard/CLI verification.

## Verdict

Multi-device release status is **not closed yet**.

The codebase has peer discovery, manual peer add, fleet status, and targeted route commands, but the required two-machine user install test has not run in this session. The correct next gate is not more local speculation; it is a real second-PC install and the scripted smoke below.

## Test Packet

Primary script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 `
  -RemoteAddr <OTHER_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> `
  -RemoteName <OTHER_PC_NAME> `
  -RouteTarget <OTHER_PC_NAME>
```

For status-only validation before remote routing:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 `
  -RemoteAddr <OTHER_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> `
  -RemoteName <OTHER_PC_NAME> `
  -SkipRoute
```

## Setup Steps

Run on both machines:

```powershell
musu up --json
musu doctor --json
musu status
```

Record from each machine:

- bridge `local_url` from `musu up --json`
- hostname/node name from `musu status`
- whether `doctor.overall` is `ok` or `warn`
- any firewall, WindowsApps alias, or package warning

If automatic discovery does not find the other node, use manual peer registration:

```powershell
musu peer add <OTHER_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> --name <OTHER_PC_NAME>
musu peer list
musu status
```

## Must-Pass Gates

1. Both machines run `musu up --json` successfully.
2. Both machines report bridge health `ok`.
3. At least one machine can add the other with `musu peer add`.
4. `musu peer list` shows the remote address or remote name.
5. `musu status` renders a fleet status without crashing.
6. If route is enabled, `musu route --target <OTHER_PC_NAME> --wait "Reply exactly: MUSU_REMOTE_ROUTE_OK"` returns the expected text.

## Current Local Evidence

Single-machine baseline on 2026-05-29:

- `musu status` showed local node `hugh_second`, 1 online node.
- `musu peer list` showed no configured remote peers.
- `musu discover --timeout 2` completed but found no peers; it emitted a Windows/Tailscale IPv6 mDNS send warning (`os error 10065`) and then reported no peers.

Interpretation:

- No multi-device claim should be made from this machine alone.
- Manual peer add is the deterministic first test path for the user's second PC.
- mDNS discovery should be treated as best-effort until a real LAN/Tailscale two-node run confirms behavior.

## Acceptance Decision

The 1.15.0-rc.1 release can be described as:

> single-machine Windows beta ready; multi-device beta test packet ready; two-machine validation pending.

It should **not** be described as:

> full multi-machine release ready.

## Follow-Up Work

- Run this plan on the user's second Windows machine.
- Capture the exact `musu up --json`, `musu doctor --json`, `musu peer list`, `musu status`, and route output.
- If mDNS discovery fails but manual peer add works, keep manual peer add as the beta path and file mDNS/Tailscale IPv6 warning as P1.
- If targeted route fails after peer add, audit bridge routing and target-name resolution before broad release.
