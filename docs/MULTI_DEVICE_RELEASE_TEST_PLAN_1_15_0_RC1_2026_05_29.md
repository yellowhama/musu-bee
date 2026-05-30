# MUSU 1.15.0-rc.1 Multi-Device Release Test Plan

**Wiki ID**: wiki/519
**Date**: 2026-05-29
**Scope**: Two Windows machines on the same LAN/Tailscale segment, current MUSU beta runtime, manual peer add fallback, dashboard/CLI verification.

## Verdict

Multi-device release status is **not closed yet**.

The codebase has peer discovery, manual peer add, fleet status, and targeted route commands, but the required two-machine user install test has not run in this session. The correct next gate is not more local speculation; it is a real second-PC install and the scripted smoke below.

## Test Packet

Package the second-PC kit from the release repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-multidevice-test-kit.ps1 -IncludeDesktopShell
```

The generated zip is written under:

```text
.local-build\multi-device-test-kit\
```

The kit contains:

- the current local-sideload MSIX
- the public signing certificate only (`.cer`; no `.pfx` private key)
- MSIX install/verify scripts
- second-PC handoff collector (`collect-second-pc-handoff.ps1`)
- second-PC one-command release check (`run-second-pc-release-check.ps1`)
- second-PC return importer (`import-second-pc-return.ps1`)
- the multi-device smoke script
- the multi-device evidence verifier
- this runbook
- checksums
- optional Tauri desktop shell MSI/NSIS bundles

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

The smoke script now:

- auto-detects repo-local `musu-rs\target\debug\musu.exe` first, then installed `musu.exe`
- writes a machine-readable `musu.multidevice_smoke_evidence.v1` evidence JSON under `.local-build\multi-device\`
- records the release version, operator machine, `started_at`, and `completed_at`
- records command output for `up`, `doctor`, `peer add`, `peer list`, `discover`, `status`, and route

Verify returned evidence before changing release status:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-multidevice-evidence.ps1 `
  -EvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -ExpectedVersion 1.15.0-rc.1
```

For committed release proof, place verified evidence under:

```text
docs\evidence\multidevice\1.15.0-rc.1\
```

Recommended import command in the release repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 `
  -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>
```

`scripts\windows\audit-desktop-release-readiness.ps1` checks committed `*.evidence.json` files there first, then raw `.local-build\multi-device\*.json`.

## Setup Steps

Run on the second PC from the extracted kit, preferred path:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust fails during sideload install, rerun the wrapper from elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -MachineTrust
```

Manual fallback on both machines:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-msix-sideload-readiness.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting
powershell -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual
powershell -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
musu up --json
musu doctor --json
musu status
```

If certificate trust fails during sideload install, rerun from elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting -MachineTrust
```

Record from each machine:

- second-PC return archive from `.local-build\second-pc-return\*.zip`
- MSIX install evidence JSON from `.local-build\msix-install\*.evidence.json`
- second-PC handoff JSON from `.local-build\second-pc-handoff\*.handoff.json`
- second-PC release-check summary from `.local-build\second-pc-release-check\*.release-check.json`
- one `suggested_remote_addrs` value from the handoff JSON
- hostname/node name from `musu status`
- whether `doctor.overall` is `ok` or `warn`
- any firewall, WindowsApps alias, or package warning

On the primary release machine, prefer importing the returned archive:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 `
  -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> `
  -RecordMsixInstall `
  -Json
```

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
7. The returned evidence verifies with the current release version, valid schema, valid timestamps, and acceptable evidence age.

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
- Use `scripts\windows\prepare-multidevice-test-kit.ps1` to generate the exact zip handed to the second PC.
- Capture the exact `musu up --json`, `musu doctor --json`, `musu peer list`, `musu status`, and route output.
- Verify and record the smoke evidence JSON from `.local-build\multi-device\` using `record-multidevice-evidence.ps1`.
- If mDNS discovery fails but manual peer add works, keep manual peer add as the beta path and file mDNS/Tailscale IPv6 warning as P1.
- If targeted route fails after peer add, audit bridge routing and target-name resolution before broad release.
