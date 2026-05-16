# V23.2 Workstream B4b — Windows PowerShell installer (wiki/372)

**Date**: 2026-05-16
**Status**: Plan-mode draft. **In plan mode, awaiting Critic** (`system-architect` recommended; see §13). Pre-Builder. Extends `musu-relay/installer/` directory created by B4a.
**Predecessors**: wiki/361 (Workstream B master plan §B4b), wiki/364 (B1 closure — Critic HIGH #1 "Windows ACL for account_key" deferred to here; AR-1 plaintext key accepted-risk), wiki/366 (B2 closure — `/api/v1/nodes/validate` returns `user_id`), wiki/370 (B4a detail plan — ABI reservation, `musu-write-key`, OpenRC layout), wiki/371 (B4a closure — operator-gated remaining items, audit-fix M1/M2/M3), V23 master plan (`V23_MASTER_PLAN_2026_05_15.md`) §0.5 lines 385-493 (3-tier install flow canonical spec)
**Branch**: `v22/gap-analysis` (continues B1+B2+B3+B5+B4a ledger; no new branch)
**Wiki ID**: `wiki/372`
**Workstream pattern**: `MODE_Agent_Team` — Researcher + Planner + Critic (`system-architect`) + Builder (PowerShell-heavy, orchestrator-plus-Plan per master plan §"Team execution model") + Auditor (`quality-engineer` — non-auth-foundational, key-handling is ABI lock not crypto novelty) + Scribe. Triggers met: (a) closes B1 deferred HIGH #1 (auth-adjacent ABI lock), (b) ≥4 files / new directory extension, (c) cross-domain (PowerShell + WSL2 interop + telemetry hybrid + OpenRC patch), (d) ≥3 specialist roles meaningful.

---

## 1. Summary

V23.2 Workstream B4b ships the Windows-side PowerShell pipeline that turns B4a's `musu-backend.tar` into a running gateway on an end-user PC. Seven new files under `musu-relay/installer/` (5 PowerShell + 1 markdown + 1 pre-compiled TypeScript shim with its source) implement the canonical V23 §0.5 3-tier install flow: BIOS-VT detection → Windows feature toggle (with reboot orchestration via self-deleting Scheduled Task) → `wsl --import` of B4a's tar → `account_key` bootstrap via installer-pipes-to-musu-write-key → gateway start with telemetry hybrid emission. Closes wiki/364 Critic HIGH #1: the per-account HMAC key is persisted INSIDE the WSL filesystem at `/etc/musu/account_key` (0600 root:root, fs.chmod meaningful), never at `%LOCALAPPDATA%\musu\` where Windows ACL semantics would make `fs.chmod` a no-op. Coordinates with B4c by writing every column of `telemetry_install` from the host probe + emitting the synthetic `install_completed` event from inside the WSL distro post-bootstrap (avoiding any chicken-and-egg modification of musu-relay's TypeScript signaling code). Risk profile is not production-correctness (B4b never touches the deployed Fly signaling) but Windows-host correctness across 6 host tiers and the ABI seam to B4a's `musu-write-key` (already shipped + LF/CR-tolerant). Orchestrator pre-resolved OQ1-OQ10 are baked in §2.1 as locked design decisions; the plan does not re-litigate.

---

## 2. Master plan adherence

Master plan §B4b (wiki/361 lines 139-144) reads, verbatim:

> **B4b — PowerShell installer + 3-tier prereq check + telemetry hooks.**
> - `installer/check-prereqs.ps1` implementing the 3-tier check (BIOS virtualization → Windows feature → our tar). Outcomes emit fields in the existing `telemetry_install` table.
> - `installer/install-wsl2.ps1` orchestrating: prereq → enable WSL2 feature (with reboot orchestration) → `wsl --import` of the bundled tar → register K3s with musu-relay-gateway → telemetry POST
> - `installer/uninstall.ps1`: `wsl --unregister musu` + clean `C:\ProgramData\musu`
> - Uses HMAC auth from B1 (this is why B1 precedes B4b)
> - Acceptance: install on a clean Windows VM goes from "downloaded the .exe" to "K3s running + gateway connecting to signaling" without operator intervention beyond the reboot prompt

Mapping each requirement to a B4b deliverable:

| Master-plan requirement | B4b deliverable | Must-have? |
|---|---|---|
| `installer/check-prereqs.ps1` with 3-tier check | `installer/check-prereqs.ps1` (§4) — 6 probes, returns JSON, write-`telemetry_install`-row-shaped output | YES |
| `installer/install-wsl2.ps1` orchestrator | `installer/install-wsl2.ps1` (§5) — 12-step pipeline, elevation, reboot orchestration, `wsl --import`, `musu-write-key` invocation, gateway boot | YES |
| `installer/uninstall.ps1` | `installer/uninstall.ps1` (§9) — `wsl --unregister musu` + cleanup + uninstall telemetry | YES |
| "Uses HMAC auth from B1" | gateway-main.js consumes `/etc/musu/account_key` (written by installer via `musu-write-key`) and signs telemetry with HMAC per B1 wire format | YES |
| "without operator intervention beyond the reboot prompt" | Scheduled Task `-AtLogOn` self-deleting trigger handles resume (§8) | YES |
| Outcomes "emit fields in the existing `telemetry_install` table" | Telemetry payload contract §7 maps every column; hybrid emission per OQ2 (gateway emits post-bootstrap from inside WSL) | YES |

Nice-to-haves (deferred per §2.2): musu.pro deep-link tunnel_token UX, localization, code-signed `.exe` wrapper, additional 7th tier for Hyper-V conflict (handled via Group Policy probe in §4.1).

### 2.1 Locked design decisions (orchestrator-resolved 2026-05-16)

Reproducing OQ1-OQ10 resolutions verbatim so future readers see the architectural choices upfront. Critic adjudicates these as a unit; individual re-litigation is out of scope per orchestrator instruction.

- **OQ1 (account_key bootstrap path) → α installer-bootstraps**. Installer POSTs `/issue_install_key` from PowerShell, gets 64-hex key, pipes to `wsl -d musu -- /usr/local/bin/musu-write-key`. Gateway's existing `bootstrapAccountKey()` (`musu-relay/src/gateway/client.ts:407-480`) becomes a redundant fallback that fires only if installer didn't pre-write. Rationale: clean failure UX (install failure surfaces at install time vs deferred gateway crash-loop); `musu-write-key --force` ABI is already shipped + unused without α.

- **OQ2 (install-time telemetry chicken-and-egg) → (i) hybrid**. Success path: installer skips `/v1/telemetry/install` POST during install; gateway emits the synthetic `install_completed` event post-bootstrap from inside WSL. Failure path: installer dumps failure to local file `%LOCALAPPDATA%\musu\install-failure.json`, picked up + uploaded by next successful install. Avoids any musu-relay TypeScript changes (B4b stays PowerShell + 1 TS shim file).

- **OQ3 (gateway main entry-point) → B4b ships gateway-main.ts as deliverable**. NEW file `musu-relay/installer/gateway-main.ts` (~50 LOC TypeScript) reads env vars, constructs `GatewayConfig`, instantiates `GatewayClient`, calls `connect()`, keeps process alive. Pre-compiled at build time (maintainer step) to `installer/gateway-main.js`; end-user installer copies the `.js` into the imported distro. Installer ALSO patches `openrc-musu-gateway.conf` inside the imported distro to launch `main.js` instead of `client.js`.

- **OQ4 (b4c_host_class enum extension) → extend with `wsl2-off-feature-unknown`**. Zero-cost extra string; documents the legitimate state where `check-prereqs.ps1` cannot determine feature state without elevation.

- **OQ5 (reboot orchestration) → Scheduled Task with `-AtLogOn` self-deleting trigger**. v21 `scripts/install.ps1:319-369` provides the precedent pattern. Rejected: RunOnce (per-user, AV flags it); refuse-and-instruct (poor UX).

- **OQ6 (tunnel_token UX) → mandatory `-TunnelToken` parameter + `Read-Host -AsSecureString` interactive fallback**. Defer musu.pro deep-link to V23.4 Tauri UI.

- **OQ7 (PowerShell floor) → 5.1**. Matches B4a precedent (B4a's `validate-import.ps1` is PS 5.1 compatible per `Set-Content -Encoding UTF8` usage) + zero-install. `#Requires -Version 5.1` directive. No PS 7-only features (no `??`, no `?.`, no `pwsh`-specific cmdlets).

- **OQ8 (tar SHA-256 source) → baked into installer with sidecar fallback**. `$ExpectedTarHash = "<hex>"` constant near top of `install-wsl2.ps1`, refreshed each release. Sidecar accepted as fallback when constant is `"<UNSET>"` (dev builds). Log `tar_hash_source: 'baked' | 'sidecar'` for B4c aggregation.

- **OQ9 (B4b scope boundary) → PowerShell + 1 new TS file (`gateway-main.ts`) only**. No modifications to existing musu-relay TypeScript (`src/gateway/client.ts`, `src/signaling/telemetry.ts`, etc.). `gateway-main.ts` is a NEW file under `installer/` (NOT `src/`). Maintainer pre-compiles to `installer/gateway-main.js`; both committed.

- **OQ10 (user_id source) → installer calls `/api/v1/nodes/validate`**. B2 introduced `user_id` return in the validate response. Installer POSTs the tunnel_token, receives `user_id`, freezes in `gateway.env` alongside `install_id` + `tunnel_token`. Install-time-frozen (not resolved every connect) for offline resilience.

### 2.2 Out of scope (explicit)

- musu.pro deep-link tunnel_token UX (`musu://install?token=…`) — V23.4 Tauri UI
- `/v1/telemetry/install_attempt` unauthenticated endpoint — V23.3 follow-up if B4b's local-file failure-dump proves insufficient
- `Disable-WindowsOptionalFeature` on uninstall — rejected (too aggressive; user may have other WSL2 distros)
- PowerShell 7+ features (`??`, `?.`, ternary, parallel ForEach-Object) — keep 5.1 compatibility
- musu-bridge inside the tar — V23.3 as K3s Pod
- Localization beyond English error strings — V23.4 Tauri i18n
- `gateway-main.ts` as a B4a-amendment (B4a is closed; ship as B4b deliverable per OQ3)
- musu-relay TypeScript changes (no existing `src/` files touched per OQ9)
- v21 `scripts/install.ps1` removal — stays in place until V23.5 cuts the native path
- Auto-update of `musu-backend.tar` — V23.3
- arm64 Windows (ARM-based Surface) — V23.3+
- BitLocker / TPM interaction — V23.5

---

## 3. File-by-file (NEW files only — one new src/ file, the rest under installer/)

Total: 7 new files (6 under `musu-relay/installer/`, 1 under `musu-relay/src/gateway/`). Zero existing files modified.

| File | Type | Purpose | LOC |
|---|---|---|---|
| `installer/check-prereqs.ps1` | PowerShell | Read-only host probe → JSON to stdout. Side-effect-free. Callable independently for B4c reproduction. | ~200 |
| `installer/install-wsl2.ps1` | PowerShell | Main installer entry-point. 12-step pipeline. Elevation refusal of un-elevated `-TunnelToken` (Critic HIGH #3), `wsl --import`, α-path orphan cleanup wrapper (Critic HIGH #2), OpenRC service patch via atomic file replace (Critic MEDIUM sed), `/etc/musu/gateway.env` atomic tmp+mv write. | ~400 |
| `installer/uninstall.ps1` | PowerShell | `wsl --unregister musu` + cleanup `%ProgramData%\musu`, `%LOCALAPPDATA%\musu`, Scheduled Task. Adds `-Reset` flag to also clear `%LOCALAPPDATA%\musu\install_id` (Critic MEDIUM install_id reuse). Idempotent. | ~100 |
| `installer/Musu-Common.psm1` | PowerShell module | Shared helpers: logging, `New-MusuInstallId`, `Get-MusuStateFile`, `Test-MusuElevation`, `Invoke-WslExec`, `Save-MusuFailureDump`, `Send-MusuPendingFailureDump`. Imported by all three `.ps1` scripts. | ~150 |
| `installer/install-musu-backend.md` | markdown | Operator runbook: install / uninstall / recovery, all 6 host tiers, troubleshooting, dev-mode escape hatches | ~150 |
| `installer/openrc-musu-gateway-b4b.conf` | OpenRC service | Drop-in replacement for B4a's `openrc-musu-gateway.conf`. Identical except `command_args` points to `dist/gateway/main.js` (was `client.js`). Atomic-replaced into `/etc/init.d/musu-gateway` by install-wsl2.ps1 step 7. | ~30 |
| `src/gateway/main.ts` | TypeScript | Gateway entry-point shim under `src/gateway/`. Compiles via existing `tsconfig.json` → `dist/gateway/main.js`. Baked into the tar automatically by B4a's `cp -r dist/gateway`. Reads `/etc/musu/gateway.env`, builds `GatewayConfig`, instantiates `GatewayClient`, calls `connect()`, emits synthetic `install_completed` telemetry, keeps alive. (Critic HIGH #1 resolution — see §10.) | ~50 |

Maintainer pre-compilation step: **none required**. `npm run build` compiles `src/gateway/main.ts` → `dist/gateway/main.js` automatically via existing `tsconfig.json`. B4a's build script (line 161: `npx tsc -p tsconfig.json`) picks it up.

`installer/openrc-musu-gateway-b4b.conf` is the only "ship a file that mirrors something in the tar" pattern — the alternative (an in-tar `main.js`-aware service file) would require modifying B4a's tar, which is rejected (B4a is closed).

Deferred to follow-on (NOT B4b):

- `installer/lang/ko.psd1` localization — V23.4 Tauri i18n
- `installer/install-wsl2.exe` code-signed wrapper — V23.5
- `installer/check-prereqs.exe` standalone host-eval tool — only if B4c data shows operators run `check-prereqs.ps1` outside the installer flow

---

## 4. 3-Tier prereq detection

This is the heart of B4b. Maps V23 master plan §0.5 lines 385-493 (`V23_MASTER_PLAN_2026_05_15.md` 3-tier install flow canonical spec) onto PowerShell probes. The classification feeds both the install-flow branch decision and the B4c host-class label.

### 4.1 Probes (read-only, side-effect-free)

| Probe | Command | Outputs | Source |
|---|---|---|---|
| BIOS-VT | Triad fallback: (1) `Get-CimInstance Win32_Processor` `.VirtualizationFirmwareEnabled`; (2) `Get-ComputerInfo` `.HyperVRequirementVirtualizationFirmwareEnabled`; (3) `systeminfo` regex matching `/Virtualization Enabled In Firmware:\s+(Yes\|No)/` (Korean: `/펌웨어에서 가상화 사용:\s+(예\|아니요)/`) | `'yes' \| 'no' \| 'unknown'` | V23 master plan §0.5 line 425; v21 `scripts/install.ps1` precedent for `systeminfo` parsing |
| WSL feature state | `Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform` (state field). Falls back to `'unknown'` if invocation throws (needs elevation) | `'enabled' \| 'disabled' \| 'unknown'` | Microsoft WSL2 install docs |
| WSL2 active | `wsl --status` exit code AND `wsl --version` output regex for `'WSL version: \d+\.\d+\.\d+'` | `'wsl2' \| 'wsl1' \| 'not_installed'` | wiki/370 §7.3 validation pre-reqs |
| Group Policy | `Get-ItemProperty HKLM:\SOFTWARE\Policies\Microsoft\Windows\WSL` (returns `'AllowWSL: 0'` if blocked); `Get-ItemProperty HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services` for AppLocker on `wsl.exe` | `'allowed' \| 'blocked' \| 'unknown'` | Researcher M2 (GPO probe accuracy) |
| AV exclusion | `Get-MpPreference \| Select-Object -ExpandProperty ExclusionPath` and check for `$env:LOCALAPPDATA\musu\wsl` substring. Defender only (third-party AV not probeable from PS). | `'wsl_excluded' \| 'wsl_not_excluded' \| 'unknown'` | Researcher M1 (AV detection robustness) |
| OS version | `Get-CimInstance Win32_OperatingSystem` `.Version` + `.BuildNumber` + `.OSLanguage` | semver-ish + i18n hint | wiki/371 §3 acceptance criteria (musu_version_raw consumer) |

All probes are wrapped in `try { … } catch { 'unknown' }` so a single probe failure does not abort the entire prereq run. `check-prereqs.ps1` outputs a single JSON object to stdout:

```json
{
  "schema_version": 1,
  "probed_at_utc": "2026-05-16T14:00:00Z",
  "host_class": "wsl2-off-feature-off",
  "elevation_required_to_classify": false,
  "probes": {
    "bios_vt": "yes",
    "wsl_feature": "disabled",
    "wsl2_active": "not_installed",
    "group_policy": "allowed",
    "av_exclusion": "wsl_not_excluded",
    "os_version": "10.0.26200",
    "os_build": 26200,
    "os_lang": 1033
  }
}
```

The `host_class` is derived by the decision tree in §4.2; raw probe values stay for B4c aggregation.

### 4.2 Tier classification (the `b4c_host_class` enum)

Six values (extends B4a's 5 with OQ4's `wsl2-off-feature-unknown`):

1. `wsl2-already-on` — `wsl2_active=wsl2` AND distro `musu` not yet present. Lowest-friction; no reboot, no DISM call.
2. `wsl2-off-feature-on` — `wsl_feature=enabled` AND `wsl2_active=not_installed` (or `wsl1`). Reachable via `wsl --install --no-distribution --no-launch` without reboot in most Win10 21H2+ and Win11 cases.
3. `wsl2-off-feature-off` — `wsl_feature=disabled` AND `bios_vt=yes`. Requires DISM + reboot (the §0.5 canonical path).
4. `wsl2-off-feature-unknown` — `wsl_feature=unknown` (probe needed elevation). Cannot classify without re-running elevated. Installer prompts UAC and re-probes.
5. `no-bios-vt-simulated` — `bios_vt=no` OR (`bios_vt=unknown` AND user did NOT pass `-AllowUnknownBiosVt`). Hard blocker per V23 master plan §0.5 line 444 "Tier-1-locked UI flow"; installer emits the BIOS-locked telemetry and refuses to proceed.
6. `fresh-win-vm` — operator-asserted via `-HostClass fresh-win-vm` parameter. Treated like `wsl2-off-feature-off` telemetry-wise but skips the BIOS-VT probe (B4c experimental host class for clean-Windows-VM acceptance testing).

Decision tree:

```
              start
                │
                ▼
        bios_vt probe
        ┌───────┼─────────────┐
        ▼       ▼             ▼
       no    unknown          yes
        │       │              │
        ▼       ▼              ▼
no-bios-vt-simulated      wsl_feature probe
(unless -AllowUnknownBiosVt    ┌──────┼─────────┐
 in which case treat as yes)   ▼      ▼          ▼
                          disabled  unknown    enabled
                              │       │           │
                              ▼       ▼           ▼
                       wsl2-off-  wsl2-off-   wsl2_active probe
                       feature-   feature-       ┌──────┼─────────┐
                       off        unknown        ▼      ▼          ▼
                                              wsl2    wsl1     not_installed
                                                │      │           │
                                                ▼      ▼           ▼
                                           wsl2-     wsl2-off-  wsl2-off-
                                           already-  feature-   feature-
                                           on        on         on
```

`-HostClass fresh-win-vm` short-circuits the tree at start.

### 4.3 Per-tier install path

| Tier | Pre-condition | Operations sequence | Expected outcome | Telemetry emitted |
|---|---|---|---|---|
| `wsl2-already-on` | wsl2 active, musu absent | tar import → musu-write-key → wait gateway ready | success, no reboot | `step_failed=NULL`, `host_class=wsl2-already-on` |
| `wsl2-off-feature-on` | feature on, wsl2 not active | `wsl --install --no-distribution --no-launch` (sets default wsl version 2) → tar import → musu-write-key → wait gateway ready | success, MAY need re-login (not full reboot) on Win10 < 22H2 | `host_class=wsl2-off-feature-on`, `step_failed=NULL` (or `step_failed=wsl_default_version` if --install fails) |
| `wsl2-off-feature-off` | feature off | DISM enable VirtualMachinePlatform + Microsoft-Windows-Subsystem-Linux → register Scheduled Task → reboot → on logon: resume → tar import → musu-write-key → wait gateway ready | success after one reboot | `host_class=wsl2-off-feature-off`, `step_failed=NULL` (or `step_failed=wsl_feature` if DISM failed) |
| `wsl2-off-feature-unknown` | feature state unknown without elevation | Prompt UAC → re-run check-prereqs elevated → classify into one of the resolved states → proceed | success after one UAC | telemetry tagged with resolved class (NOT `wsl2-off-feature-unknown` if resolution succeeded; that label only persists on full failure to elevate) |
| `no-bios-vt-simulated` | bios_vt=no | Show §0.5 Tier-1-locked UI message (text-mode for now; V23.4 Tauri replaces) → exit 1 → emit telemetry | hard fail; user sees QR-style guidance to enable BIOS-VT | `host_class=no-bios-vt-simulated`, `step_failed=bios_vt_off`, `step_error_class=hard_blocker_bios` |
| `fresh-win-vm` | operator-asserted | Same as `wsl2-off-feature-off` but skip bios_vt probe (assume yes) | success after one reboot | `host_class=fresh-win-vm`, `step_failed=NULL` |

---

## 5. Install flow (the `install-wsl2.ps1` main path)

12-step pipeline matching V23 master plan §0.5 lines 405-442 (3-tier install flow canonical spec). Each step has explicit pre-condition, exact PowerShell, expected outcome, and failure-path telemetry.

### Step 1 — Generate or recover install_id; verify elevation

```powershell
#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory=$false)][string]$TunnelToken,    # OQ6 — mandatory in non-resume mode; checked below
  [string]$HostClass = "",                              # OQ4 — operator override
  [switch]$AllowUnknownBiosVt,
  [switch]$ResumeAfterReboot,                           # OQ5 — internal, set by Scheduled Task
  [string]$StateFile = "",                              # OQ5 — internal
  [string]$TarPath = "",                                # default: %ProgramData%\musu\staging\musu-backend.tar
  [string]$SigningBase = "https://signaling.musu.pro",  # B1 wire base
  [string]$MusuProBase = "https://musu.pro",            # B2 /api/v1/nodes/validate base
  [switch]$WhatIf
)

# install_id reuse (Researcher H10) — read %LOCALAPPDATA%\musu\install_id if present
$InstallIdFile = Join-Path $env:LOCALAPPDATA "musu\install_id"
if (Test-Path $InstallIdFile) {
  $script:InstallId = (Get-Content $InstallIdFile -Raw).Trim()
  Write-MusuInfo "Reusing existing install_id $($script:InstallId.Substring(0,8))..."
} else {
  $script:InstallId = [Guid]::NewGuid().ToString("N")
  New-Item -ItemType Directory -Force -Path (Split-Path $InstallIdFile) | Out-Null
  Set-Content -Path $InstallIdFile -Value $script:InstallId -Encoding UTF8
}

# Elevation check (Critic HIGH #3 resolution)
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent())
$isElevated = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# REFUSE un-elevated launch with -TunnelToken on the command line.
# Critic HIGH #3: command-line args of the un-elevated parent are visible to other processes
# via Get-Process | Select CommandLine. Even with the elevation hop using a temp file, the
# un-elevated parent already exposed the token. Force the operator to either (a) launch elevated
# from the start, or (b) launch without -TunnelToken so the elevated child prompts interactively.
if (-not $isElevated -and $TunnelToken) {
  throw "For security, do not pass -TunnelToken on the un-elevated command line. Either: (a) re-launch this script from an elevated PowerShell prompt with -TunnelToken, OR (b) re-launch without -TunnelToken and the elevated child will prompt interactively via Read-Host -AsSecureString."
}

if (-not $isElevated) {
  # Self-elevate via Start-Process -Verb RunAs. No -TunnelToken passed (guaranteed by the throw above).
  # The elevated child's step 5 will prompt via Read-Host -AsSecureString.
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $MyInvocation.MyCommand.Path)
  foreach ($k in $PSBoundParameters.Keys) {
    if ($k -eq "TunnelToken") { continue }    # never propagate; child prompts
    $v = $PSBoundParameters[$k]
    if ($v -is [switch]) { if ($v.IsPresent) { $argList += "-$k" } }
    else { $argList += "-$k"; $argList += "$v" }
  }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
  exit 0
}
```

The elevation hop drops `-TunnelToken` from the relaunched argument list entirely. The elevated child's step 5 prompts via `Read-Host -AsSecureString` (interactive, console-visible, never logged in CommandLine). Critic HIGH #3 resolution: `Invoke-MusuElevationHop` from earlier drafts is REMOVED — no temp-file pattern needed.

### Step 2 — Run `check-prereqs.ps1` → tier + state

```powershell
$prereqJson = & "$PSScriptRoot\check-prereqs.ps1" -OutputFormat Json | Out-String
$prereq = $prereqJson | ConvertFrom-Json
$script:HostClass = if ($HostClass) { $HostClass } else { $prereq.host_class }
Write-MusuInfo "Detected host_class: $($script:HostClass)"
```

### Step 3 — Branch on tier

Switch on `$script:HostClass` per §4.3. The remainder of this section assumes `wsl2-off-feature-off` (the canonical §0.5 line 411 path); other tiers skip ahead to step 4 or 6 as documented in §4.3.

For `wsl2-off-feature-off`:

```powershell
if ($PSCmdlet.ShouldProcess("VirtualMachinePlatform + WSL", "Enable Windows features")) {
  & dism.exe /online /enable-feature `
       /featurename:VirtualMachinePlatform /all /norestart
  if ($LASTEXITCODE -ne 0) {
    Save-MusuFailureDump -Step "wsl_feature" -ErrorClass "permission"
    throw "dism enable VirtualMachinePlatform failed: exit $LASTEXITCODE"
  }
  & dism.exe /online /enable-feature `
       /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
  if ($LASTEXITCODE -ne 0) {
    Save-MusuFailureDump -Step "wsl_feature" -ErrorClass "permission"
    throw "dism enable WSL failed: exit $LASTEXITCODE"
  }
}

# Persist state for Scheduled Task resume
$state = @{
  install_id = $script:InstallId
  stage_completed = "wsl_feature_enabled_pending_reboot"
  elevated_user = $env:USERNAME
  tar_path = (Resolve-Path $TarPath).Path
  tunnel_token_hash = (Get-MusuStringHash -InputString $TunnelToken)
  host_class = $script:HostClass
  signing_base = $SigningBase
  musu_pro_base = $MusuProBase
}
Save-MusuState -State $state -StateFile (Get-MusuStateFile)

Register-MusuResumeTask -StateFile (Get-MusuStateFile)
Write-MusuOk "Will reboot. Continue after reboot via Scheduled Task auto-run."
Restart-Computer -Confirm -Force
exit 0
```

Resume path picks up at step 4.

### Step 4 — Verify tar SHA-256 (baked or sidecar fallback)

```powershell
# Baked constant (refreshed each release per OQ8)
$ExpectedTarHash = "<UNSET>"   # builder substitutes hex at release time
$actualHash = (Get-FileHash -Path $TarPath -Algorithm SHA256).Hash.ToLower()

if ($ExpectedTarHash -eq "<UNSET>") {
  # Dev-build path — accept sidecar
  $sidecar = "$TarPath.sha256"
  if (-not (Test-Path $sidecar)) {
    throw "tar SHA-256 baked constant UNSET and no sidecar $sidecar found"
  }
  $expected = (Get-Content $sidecar -Raw).Trim().ToLower()
  $script:TarHashSource = "sidecar"
} else {
  $expected = $ExpectedTarHash.ToLower()
  $script:TarHashSource = "baked"
}

if ($actualHash -ne $expected) {
  Save-MusuFailureDump -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact"
  throw "tar SHA-256 mismatch: expected $expected, got $actualHash (source: $script:TarHashSource)"
}
Write-MusuOk "tar SHA-256 verified (source: $script:TarHashSource)"
```

### Step 5 — Acquire tunnel_token + user_id

`-TunnelToken` is mandatory in non-resume mode. On resume, the state file's `tunnel_token_hash` is matched against operator-supplied `-TunnelToken` (operator re-supplies on first prompt after reboot; we hash-compare to detect "wrong token supplied"). If the operator does not re-supply, fall back to `Read-Host -AsSecureString`.

```powershell
if (-not $TunnelToken -and -not $ResumeAfterReboot) {
  $secureToken = Read-Host -Prompt "Enter musu.pro tunnel token" -AsSecureString
  $TunnelToken = [System.Net.NetworkCredential]::new("", $secureToken).Password
}

# Resolve user_id via B2's /api/v1/nodes/validate (OQ10)
$validateBody = @{ token = $TunnelToken } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Uri "$MusuProBase/api/v1/nodes/validate" `
  -Method POST -ContentType "application/json" -Body $validateBody `
  -UseBasicParsing -TimeoutSec 30

if (-not $resp.valid) {
  Save-MusuFailureDump -Step "validate_token" -ErrorClass "invalid_token"
  throw "musu.pro /validate refused tunnel_token"
}
if (-not $resp.user_id) {
  Save-MusuFailureDump -Step "validate_token" -ErrorClass "musu_pro_b2_not_deployed"
  throw "musu.pro /validate did not return user_id (B2 not deployed?)"
}
$script:UserId = $resp.user_id
Write-MusuOk "Resolved canonical user_id $($script:UserId.Substring(0,8))..."
```

### Step 6 — `wsl --import` with ACL hardening

**Critic HIGH #2 resolution: pre-check for existing 'musu' distro AND wrap steps 6-9 in try/catch with orphan-cleanup on steps 7-9 failure.** Without this, a network blip on step 9 leaves a registered distro that the next install run can't import over.

```powershell
$ImportDir = Join-Path $env:LOCALAPPDATA "musu\wsl"
New-Item -ItemType Directory -Force -Path $ImportDir | Out-Null
# ACL hardening — only SYSTEM + current user can read (no other Users)
icacls $ImportDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "${env:USERNAME}:(OI)(CI)F" | Out-Null

# Pre-check: refuse if 'musu' distro already exists, unless -ForceReinstall
$existing = & wsl.exe -l --quiet 2>$null | Where-Object { $_.Trim() -eq "musu" }
if ($existing -and -not $ForceReinstall) {
  throw "A 'musu' WSL distro already exists. Run uninstall.ps1 first, or re-run install-wsl2.ps1 with -ForceReinstall to overwrite (destroys K8s state inside)."
}
if ($existing -and $ForceReinstall) {
  Write-MusuWarn "ForceReinstall: unregistering existing 'musu' distro"
  & wsl.exe --unregister musu 2>$null | Out-Null
}

& wsl.exe --import musu $ImportDir $TarPath --version 2
if ($LASTEXITCODE -ne 0) {
  Save-MusuFailureDump -Step "wsl_import" -ErrorClass "import_failed"
  throw "wsl --import failed: exit $LASTEXITCODE"
}
Write-MusuOk "wsl --import musu succeeded"

# Steps 7-9 are wrapped in try { ... } catch { wsl --unregister musu; rethrow } below — see §5.6
# α-path orphan recovery (Critic HIGH #2): if step 7, 8, OR 9 throws, undo step 6 before bubbling up.
```

### Step 6.5 — α-path orphan cleanup wrapper (Critic HIGH #2)

Steps 7, 8, and 9 run inside this guarded block. If any throws, the catch unregisters the just-imported distro so the next install run starts from a clean state. Step 6 itself is OUTSIDE the wrapper because if `wsl --import` throws, no distro got registered — nothing to clean up.

```powershell
try {
  # Step 7: bake gateway-main.js + replace OpenRC service file
  # Step 8: write /etc/musu/gateway.env atomically
  # Step 9: POST /issue_install_key + pipe to musu-write-key
  # ... (see below)
} catch {
  Write-MusuErr "Install failed during steps 7-9: $($_.Exception.Message). Unregistering 'musu' distro to clean orphan state."
  & wsl.exe --unregister musu 2>$null | Out-Null
  Save-MusuFailureDump -Step "alpha_bootstrap" -ErrorClass "rolled_back"
  throw
}
```

### Step 7 — Replace OpenRC service file (atomic)

**Critic HIGH #1 follow-on**: since `main.ts` is now at `src/gateway/main.ts`, its compiled output `dist/gateway/main.js` is ALREADY in the tar (B4a's `cp -r dist/gateway` bakes everything in dist/gateway/). Step 7 no longer needs to copy a shim into the distro — only patch the OpenRC service file to launch `main.js` instead of `client.js`.

**Critic MEDIUM (sed fragility) resolution**: replace the brittle `sed -i` with a full-file atomic replacement using a B4b-side `openrc-musu-gateway-b4b.conf` file. Bulletproof against future B4a tar updates that change `command_args` shape.

```powershell
# Replace /etc/init.d/musu-gateway with B4b's openrc-musu-gateway-b4b.conf (atomic via tmp+mv).
# This file is byte-identical to B4a's openrc-musu-gateway.conf EXCEPT command_args points to main.js.
$gwSrc = "$PSScriptRoot\openrc-musu-gateway-b4b.conf"
Get-Content $gwSrc -Raw -Encoding UTF8 | & wsl.exe -d musu -- sh -c `
  "cat > /etc/init.d/musu-gateway.tmp && chmod 0755 /etc/init.d/musu-gateway.tmp && mv /etc/init.d/musu-gateway.tmp /etc/init.d/musu-gateway"

Write-MusuOk "OpenRC service file replaced atomically"
```

New B4b deliverables (file count moves from 7 to 8): `musu-relay/installer/openrc-musu-gateway-b4b.conf` (~30 LOC, copy of B4a's openrc-musu-gateway.conf with one-line diff on command_args) AND `musu-relay/src/gateway/main.ts` (~50 LOC, the entry-point shim — see §10).

### Step 8 — Write `gateway.env` via `musu-write-env` (new ABI seam)

`musu-write-env` is a NEW sibling helper to `musu-write-key`. Lives at `/usr/local/bin/musu-write-env`, ships in the tar (NOTE: B4a is closed — see §6.4 for deferral handling). For B4b shipping NOW, the installer writes `gateway.env` directly via a heredoc from PowerShell:

```powershell
$envContent = @"
MUSU_SIGNALING_URL=$SigningBase
MUSU_TELEMETRY_BASE=$SigningBase/v1/telemetry
MUSU_TUNNEL_TOKEN=$TunnelToken
MUSU_USER_ID=$script:UserId
MUSU_INSTALL_ID=$script:InstallId
MUSU_ACCOUNT_KEY_PATH=/etc/musu/account_key
MUSU_HOST_CLASS=$script:HostClass
MUSU_TAR_HASH_SOURCE=$script:TarHashSource
"@

# Atomic write via tmp+mv (Critic MEDIUM resolution — heredoc atomicity).
# Without the .tmp+mv pattern, an interrupted write leaves a partial file with the tunnel_token
# half-leaked. musu-write-key already uses this pattern (musu-write-key:90-114).
$envContent | & wsl.exe -d musu -- sh -c `
  "umask 077 && cat > /etc/musu/gateway.env.tmp && chmod 0600 /etc/musu/gateway.env.tmp && chown root:root /etc/musu/gateway.env.tmp && mv /etc/musu/gateway.env.tmp /etc/musu/gateway.env"
```

Note the `umask 077` before `cat` — defensive in case `/etc/musu/` was not pre-set 0700 (B4a sets it but the WSL distro could be tampered). The `.tmp` + `mv` pattern is atomic on POSIX (rename(2) within the same filesystem), so partial-write windows cannot leak the tunnel_token.

### Step 9 — Generate account_key via `/issue_install_key` + pipe to `musu-write-key`

```powershell
$issueBody = @{
  tunnel_token = $TunnelToken
  musu_install_id = $script:InstallId
} | ConvertTo-Json -Compress

$resp = Invoke-RestMethod -Uri "$SigningBase/v1/telemetry/issue_install_key" `
  -Method POST -ContentType "application/json" -Body $issueBody `
  -UseBasicParsing -TimeoutSec 30

if (-not $resp.account_key) {
  Save-MusuFailureDump -Step "issue_install_key" -ErrorClass "no_key_returned"
  throw "Signaling /issue_install_key did not return account_key"
}
$accountKey = $resp.account_key
# Validate shape (64 lowercase hex)
if ($accountKey -notmatch '^[0-9a-f]{64}$') {
  throw "Signaling returned malformed account_key"
}

# Write via temp file (MEDIUM finding — never raw stdin to avoid CRLF; musu-write-key handles
# CRLF per audit-fix M2 in wiki/371 but defense-in-depth)
$keyTmp = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($keyTmp, $accountKey, [System.Text.UTF8Encoding]::new($false))
  icacls $keyTmp /inheritance:r /grant:r "${env:USERNAME}:F" "SYSTEM:F" | Out-Null
  Get-Content $keyTmp -Raw -Encoding UTF8 | & wsl.exe -d musu -- /usr/local/bin/musu-write-key
  if ($LASTEXITCODE -ne 0) {
    Save-MusuFailureDump -Step "musu_write_key" -ErrorClass "key_write_failed"
    throw "musu-write-key exit $LASTEXITCODE"
  }
} finally {
  if (Test-Path $keyTmp) { Remove-Item -Force $keyTmp }
}
Write-MusuOk "account_key written to /etc/musu/account_key inside musu distro"
```

Note: `accountKey` is held in PowerShell as a plain string for the duration of steps 8-9. PowerShell 5.1 cannot reliably zero string memory; documented in §13 attack 7 as acceptance of B1 AR-3 (no V8/CLR string-zeroization) extended to PowerShell.

### Step 10 — Start `musu-init` (which K3s → account_key wait → gateway)

`/etc/wsl.conf [boot] command` is NOT set in B4a (per wiki/371 audit-fix M1 — removed to avoid dual entry-point). To trigger musu-init on first boot, we either (a) rely on OpenRC runlevel which B4a wired (`/etc/runlevels/default/musu-init` symlink), or (b) explicitly invoke. Per B4a §5 step 7 (wiki/370), runlevel handles it. But `wsl --import` does NOT run any boot command — OpenRC needs an explicit kick:

```powershell
# Kick OpenRC's default runlevel
& wsl.exe -d musu -- sh -c 'openrc default && echo MUSU_INIT_KICK_OK'
```

Since `account_key` already exists from step 9 and `gateway.env` from step 8, `musu-init`'s account_key wait phase exits immediately and `musu-gateway` starts.

### Step 11 — Wait for gateway readiness

```powershell
$readyDeadline = (Get-Date).AddSeconds(120)
$ready = $false
while ((Get-Date) -lt $readyDeadline) {
  # Probe: ws connection log line in /var/log/musu-gateway.log
  $log = & wsl.exe -d musu -- tail -50 /var/log/musu-gateway.log 2>$null
  if ($log -match '\[gateway\] welcomed as peer=') {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Save-MusuFailureDump -Step "musu_relay_start" -ErrorClass "gateway_timeout"
  throw "musu-gateway did not connect to signaling within 120s"
}
Write-MusuOk "musu-gateway connected to signaling"
```

(Alternative health probes considered: HTTP probe to `/etc/rancher/k3s/k3s.yaml` API server — but the gateway's WS welcome is the more meaningful "the whole stack works" signal. Critic adjudicates.)

### Step 12 — Cleanup staging + Scheduled Task

```powershell
# Drop the staging tar copy (it was needed for elevated read; not the original)
$stagingTar = Join-Path $env:ProgramData "musu\staging\musu-backend.tar"
if (Test-Path $stagingTar) { Remove-Item -Force $stagingTar }

# Unregister the resume task (only fires if we actually got here from a reboot)
Unregister-ScheduledTask -TaskName "musu-install-resume" -Confirm:$false `
  -ErrorAction SilentlyContinue

# Remove state file
$stateFile = Get-MusuStateFile
if (Test-Path $stateFile) { Remove-Item -Force $stateFile }

# Upload any pending failure dump (from a prior failed install on this host)
$pendingFailure = Join-Path $env:LOCALAPPDATA "musu\install-failure.json"
if (Test-Path $pendingFailure) {
  Send-MusuPendingFailureDump -FailureFile $pendingFailure -SigningBase $SigningBase
}

Write-MusuOk "Install complete. musu-gateway running."
```

Note: synthetic `install_completed` telemetry event is emitted by `gateway-main.js` from inside WSL (OQ2 hybrid), NOT from PowerShell. PowerShell only handles the failure-path dump.

---

## 6. ABI seams between B4b and other components

### 6.1 Inbound from B4a (DO NOT VIOLATE)

- `/etc/musu/account_key` (0600 root:root, 64-byte lowercase hex, no newline) — written by `musu-write-key`
- `/usr/local/bin/musu-write-key` (stdin contract per wiki/370 §4, `--force` flag, exit codes 0/1/2/3) — invoked from step 9
- `/etc/musu-version` (provenance — installer reads to populate telemetry `musu_version`) — present per wiki/371 §3
- `/etc/wsl.conf [user] default=root` (already baked per wiki/371 audit-fix M1 — NO `[boot]` block, runlevel symlink is sole entry-point)
- `musu-init` is the sole orchestrator entry-point (NOT k3s/gateway services directly); started via `openrc default`
- B4a's tar layout (wiki/370 §4) — `/var/lib/musu/`, `/var/lib/rancher/k3s/agent/images/`, `/usr/local/lib/musu-gateway/dist/`, `/etc/musu/` (0700 root:root, empty until B4b writes)

### 6.2 Outbound to B4c

- `validation-result.json` schema extension: B4c writes `b4c_host_id` (`$env:COMPUTERNAME` lowercased per wiki/371 C14) + `b4c_host_class` (6 values per OQ4)
- Telemetry events tagged with `host_class` + `install_id` (server-side `telemetry_install.b4c_host_class` column extension per B4c's own schema work)
- Scheduled Task pattern documented for B4c experiment reproducibility (each B4c host reproduces the same `-AtLogOn` self-deleting trigger)
- `check-prereqs.ps1 -OutputFormat Json` is callable INDEPENDENTLY by B4c experimenters for pre-install host classification

### 6.3 To musu.pro

- `POST /api/v1/nodes/validate` with `{ token }` → receives `{ valid, plan, node_id, user_id }` (B2 contract per wiki/366)
- `POST /v1/telemetry/issue_install_key` with `{ tunnel_token, musu_install_id }` → receives `{ account_key, user_id, issued_at }` per wiki/364 B1 contract; 409 hard-fail if already issued
- Synthetic `install_completed` event from gateway-main.js via HMAC-signed `POST /v1/telemetry/install` (OQ2 hybrid)

### 6.4 New ABI surface introduced by B4b

- `/etc/musu/gateway.env` file inside WSL — key=value, 0600 root:root, written by installer step 8. Keys:
  - `MUSU_SIGNALING_URL=https://signaling.musu.pro`
  - `MUSU_TELEMETRY_BASE=https://signaling.musu.pro/v1/telemetry`
  - `MUSU_TUNNEL_TOKEN=<from operator>`
  - `MUSU_USER_ID=<from /api/v1/nodes/validate>`
  - `MUSU_INSTALL_ID=<generated by installer>`
  - `MUSU_ACCOUNT_KEY_PATH=/etc/musu/account_key`
  - `MUSU_HOST_CLASS=<one of 6 enum>`
  - `MUSU_TAR_HASH_SOURCE=baked|sidecar`
- `gateway-main.js` (compiled from `gateway-main.ts`) — replaces `client.js` as the `command_args` target for `/etc/init.d/musu-gateway`. Reads `gateway.env`, instantiates `GatewayClient`, calls `connect()`.
- `%LOCALAPPDATA%\musu\install_id` — UTF-8 file, 32 hex chars (Guid format "N"), reused across re-installs (Researcher H10 install_id stability)
- `%LOCALAPPDATA%\musu\install-failure.json` — failure-path local dump (schema in §7)
- `%ProgramData%\musu\install-state.json` — Scheduled Task resume state (§8)
- Scheduled Task name `musu-install-resume` — self-deleting after resume completes

Note on `musu-write-env`: a candidate sibling helper considered to mirror `musu-write-key`. Rejected for B4b shipping NOW because B4a is closed; the heredoc approach in step 8 achieves equivalent safety. Filed as follow-on B4b.1 if B4c data shows operators want a CLI to rotate `gateway.env` without re-installing.

---

## 7. Telemetry payload contract

Maps every column in `telemetry_install` (per wiki/364 B1 schema v41) to a B4b-supplied value. Hybrid emission per OQ2: gateway-main.js POSTs the install row from inside WSL after bootstrap (HMAC-signed); PowerShell installer dumps failures locally for next-install upload.

| Column | Source | When emitted |
|---|---|---|
| `musu_install_id` | installer-generated UUID, reused from `%LOCALAPPDATA%\musu\install_id` | install start |
| `musu_version` | from `wsl -d musu -- cat /etc/musu-version` after import | post-import |
| `os` | `"windows"` literal | always |
| `os_version` | `Get-CimInstance Win32_OperatingSystem.Version` | host probe |
| `wsl2_present_at_start` | `check-prereqs.ps1 .probes.wsl2_active == "wsl2"` | pre-install probe |
| `wsl2_feature_enabled` | `check-prereqs.ps1 .probes.wsl_feature == "enabled"` | pre-install probe |
| `bios_virtualization_detected` | `check-prereqs.ps1 .probes.bios_vt` (`yes`/`no`/`unknown`) | pre-install probe |
| `step_failed` | one of: `wsl_feature`, `wsl_import`, `k3s_start`, `musu_relay_start`, `av_block`, `group_policy_block`, `bios_vt_off`, `v21_collision`, `validate_token`, `issue_install_key`, `musu_write_key`, `tar_hash_mismatch`, `NULL` | failure path only |
| `step_error_class` | `hard_blocker_bios`, `timeout`, `permission`, `network`, `av_block`, `group_policy_block`, `unknown`, `invalid_token`, `musu_pro_b2_not_deployed`, `tampered_artifact`, `gateway_timeout`, `key_write_failed`, `NULL` | failure path only |
| `elapsed_ms` | `(Get-Date) - $script:StartTime` total milliseconds | install end |
| `b4c_host_class` | one of 6 enum values per OQ4 | always (B4c column extension) |

Success-path emission (from inside WSL via gateway-main.js):

```typescript
// In gateway-main.ts post-connect
const installEvent = {
  musu_install_id: env.MUSU_INSTALL_ID,
  os: "windows",
  os_version: env.MUSU_OS_VERSION,        // gateway-main reads from gateway.env extension
  musu_version: fs.readFileSync("/etc/musu-version", "utf-8").match(/^git_sha=(.+)$/m)?.[1] ?? "unknown",
  wsl2_present_at_start: env.MUSU_WSL2_PRESENT_AT_START === "true",
  wsl2_feature_enabled: env.MUSU_WSL2_FEATURE_ENABLED === "true",
  bios_virtualization_detected: env.MUSU_BIOS_VT,
  step_failed: null,
  step_error_class: null,
  elapsed_ms: parseInt(env.MUSU_INSTALL_ELAPSED_MS, 10),
  b4c_host_class: env.MUSU_HOST_CLASS,
};
// HMAC-sign via existing client.ts:514-549 path; gateway-main extends gateway.env with the install-probe fields written by PowerShell
```

PowerShell step 8 is therefore extended to write these probe fields into `gateway.env` too (single source of truth for gateway-main's install-event emission).

Failure-path local dump at `%LOCALAPPDATA%\musu\install-failure.json`:

```json
{
  "install_id": "abc123...",
  "schema_version": 1,
  "failure_step": "wsl_feature",
  "failure_class": "permission",
  "host_state": {
    "bios_vt": "yes",
    "wsl_feature": "disabled",
    "wsl2_active": "not_installed",
    "os_version": "10.0.26200",
    "host_class": "wsl2-off-feature-off"
  },
  "timestamp_utc": "2026-05-16T14:00:00Z",
  "elapsed_ms_before_failure": 5430,
  "tar_hash_source": "baked",
  "user_consent_to_upload": false
}
```

`user_consent_to_upload` defaults to `false`; flipped to `true` on the next successful install's step 12 cleanup (which then calls `Send-MusuPendingFailureDump` to POST to `/v1/telemetry/install_failed` — a new unauthenticated endpoint that is FILED AS FOLLOW-ON, NOT IMPLEMENTED IN B4b). Rationale: V23.2 cannot land a new auth-free telemetry endpoint without B3-style admin auth review; the local file persists until V23.3 wires the upload path. The local file IS visible to support engineers via `musu-cli dump-install-failure` (also follow-on).

Sensitive fields explicitly NOT included in the failure dump: `tunnel_token`, `account_key`, `user_id`, raw `host_lang` if it could leak locale beyond the OSLanguage int.

---

## 8. Reboot orchestration (Scheduled Task `-AtLogOn`)

Exact pattern adapted from v21 `scripts/install.ps1:319-369`. Differences from v21:

- v21 uses Scheduled Task for a PERSISTENT service (musu-bridge daemon)
- B4b uses Scheduled Task for a ONE-SHOT resume after reboot — task self-unregisters in step 12 after successful completion

State file `$env:ProgramData\musu\install-state.json`:

```json
{
  "install_id": "...",
  "stage_completed": "wsl_feature_enabled_pending_reboot",
  "elevated_user": "...",
  "tar_path": "...",
  "tunnel_token_hash": "...",
  "host_class": "wsl2-off-feature-off",
  "signing_base": "https://signaling.musu.pro",
  "musu_pro_base": "https://musu.pro",
  "saved_at_utc": "2026-05-16T14:00:00Z"
}
```

`tunnel_token_hash` = HMAC-SHA256("musu-b4b-resume-v1", tunnel_token) hex — verifies on resume that operator re-supplied the same token. NOT the raw token (which must not touch disk per Researcher H7).

Scheduled Task registration:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\install-wsl2.ps1`" -ResumeAfterReboot -StateFile `"$env:ProgramData\musu\install-state.json`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME `
  -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName "musu-install-resume" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  | Out-Null
```

`-RunLevel Highest` requests elevation on resume (UAC consent already cached from step 1; Windows replays it). If UAC declines, the task script self-prompts and re-elevates.

Operator UX flow for `wsl2-off-feature-off`:

1. Operator runs `install-wsl2.ps1 -TunnelToken <hex>` → UAC consent (step 1)
2. Elevated installer detects feature-off tier → prompts "Will enable WSL2 feature + reboot. Continue? [Y/n]"
3. On `Y`: DISM enable features (no-restart flag) → register Scheduled Task → save state → `Restart-Computer -Confirm -Force`
4. On reboot + logon: Scheduled Task fires → installer self-elevates (UAC replay) → `-ResumeAfterReboot -StateFile <path>` mode
5. Resume reads state, verifies tunnel_token_hash if operator re-supplied OR prompts via `Read-Host -AsSecureString`
6. Continues at step 4 (tar verify) → step 12 (cleanup) → `Unregister-ScheduledTask`

If operator does NOT re-supply tunnel_token after reboot (e.g., installer prompts but user closes window): the task remains registered; on next logon it re-fires. Documented in §13 attack 9 (token-expiry UX).

---

## 9. Uninstall flow (`uninstall.ps1`)

Five idempotent steps:

```powershell
#Requires -Version 5.1
[CmdletBinding()]
param([switch]$Quiet)

# Step 1: Telemetry "uninstall" event (best-effort; ignore failures)
$installIdFile = Join-Path $env:LOCALAPPDATA "musu\install_id"
if (Test-Path $installIdFile) {
  $installId = (Get-Content $installIdFile -Raw).Trim()
  try {
    & wsl.exe -d musu -- sh -c "echo 'uninstall' > /var/log/musu-uninstall.log" 2>$null
    # NOTE: HMAC-signed POST to /v1/telemetry/install with step_failed=uninstall is
    # filed as follow-on (no /uninstall endpoint exists in B1's schema). For now, log local.
  } catch { }
}

# Step 2: wsl --unregister musu (idempotent — exits 0 if absent)
& wsl.exe --unregister musu 2>$null
Write-MusuOk "wsl --unregister musu"

# Step 3: Remove %LOCALAPPDATA%\musu\
$localData = Join-Path $env:LOCALAPPDATA "musu"
if (Test-Path $localData) {
  Remove-Item -Recurse -Force $localData
  Write-MusuOk "Removed $localData"
}

# Step 4: Remove %ProgramData%\musu\
$progData = Join-Path $env:ProgramData "musu"
if (Test-Path $progData) {
  Remove-Item -Recurse -Force $progData
  Write-MusuOk "Removed $progData"
}

# Step 5: Unregister Scheduled Task (idempotent)
Unregister-ScheduledTask -TaskName "musu-install-resume" -Confirm:$false `
  -ErrorAction SilentlyContinue
Write-MusuOk "Scheduled Task removed"

exit 0
```

Exit code semantics: 0 on success (including no-op when nothing installed); non-zero only on access-denied (operator running without elevation against admin-owned ProgramData).

Explicit non-actions:

- Does NOT `Disable-WindowsOptionalFeature` (user may have other WSL2 distros)
- Does NOT remove the v21 `scripts/install.ps1` Scheduled Task `musu-bridge` (different product, different path)
- Does NOT modify firewall rules (none were added by install)

---

## 10. Build artifact: `main.ts` (located at `musu-relay/src/gateway/main.ts`)

**Critic HIGH #1 resolution**: gateway-main.ts is placed at `musu-relay/src/gateway/main.ts` (NOT `installer/gateway-main.ts`). Reasoning: `import { GatewayClient } from "./client"` resolves cleanly when main.ts is a sibling of client.ts under `src/gateway/`. The existing `tsconfig.json` `include: ["src"]` picks it up; `npm run build` produces `dist/gateway/main.js` alongside the other gateway files automatically. No new tsconfig.json needed, no `--rootDir` shenanigans. Mild OQ9 deviation — B4b adds ONE new src/ file but modifies zero existing src/ files. B4b's PowerShell installer copies the compiled `dist/gateway/main.js` from the imported tar's existing location to itself (no copy needed — it's already in the tar from B4a's `cp -r dist/gateway` step).

Wait — this means B4b doesn't need to bake anything into the distro post-import! `main.js` is already in the tar (under `/usr/local/lib/musu-gateway/dist/gateway/main.js`) because B4a's build script does `cp -r dist/gateway`. Step 7 of install-wsl2.ps1 simplifies dramatically:
- BEFORE Critic HIGH #1 resolution: copy `gateway-main.js` into distro + patch OpenRC service file
- AFTER: just replace OpenRC service file (since `main.js` is already there)

**But this requires B4a's tar to actually contain `main.js`**. B4a is closed and its build script does `cp -r dist/gateway` — so if `src/gateway/main.ts` exists at tar-build time, `dist/gateway/main.js` ships automatically. **B4b's deliverable adds `src/gateway/main.ts` (new file) which gets baked into the NEXT tar build**. B4a's tar built before B4b's main.ts was added would NOT contain main.js — and that tar's first-build is OPERATOR-GATED. Net: the operator will build a fresh tar AFTER B4b lands, which is the normal flow.

Source contents (~50 lines) at `musu-relay/src/gateway/main.ts`:

```typescript
// musu-relay/src/gateway/main.ts — V23.2 Workstream B4b (wiki/372)
// Gateway entry-point for the WSL2 backend distro (B4a + B4b).
// Replaces dist/gateway/client.js as the OpenRC service entry-point.
// (client.ts only exports the class; this file constructs + connects.)
//
// Reads /etc/musu/gateway.env, builds GatewayConfig, connects, emits the
// synthetic install_completed telemetry event (OQ2 hybrid path).

import * as fs from "fs";
import { GatewayClient, GatewayConfig, DEFAULT_STUN_SERVERS } from "./client";

function readEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  const txt = fs.readFileSync(p, "utf-8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const envFile = process.env.MUSU_ENV_FILE ?? "/etc/musu/gateway.env";
  const env = readEnvFile(envFile);

  const keyPath = env.MUSU_ACCOUNT_KEY_PATH ?? "/etc/musu/account_key";
  let accountKey: string | undefined;
  try {
    accountKey = fs.readFileSync(keyPath, "utf-8").trim();
  } catch (err) {
    console.error("[gateway-main] account_key read failed; bootstrapAccountKey fallback will fire");
  }

  // Convert wss:// from https://
  const signalingWs = env.MUSU_SIGNALING_URL.replace(/^https?:/, (m) =>
    m === "https:" ? "wss:" : "ws:"
  ) + "/signaling";

  const cfg: GatewayConfig = {
    signalingUrl: signalingWs,
    token: env.MUSU_TUNNEL_TOKEN,
    userId: env.MUSU_USER_ID,
    stunServers: DEFAULT_STUN_SERVERS,
    pcFactory: { create: () => { throw new Error("TODO T1.9 wrtc factory wiring"); } },
    telemetryBase: env.MUSU_TELEMETRY_BASE,
    musuInstallId: env.MUSU_INSTALL_ID,
    accountKey,
    onLog: (l) => process.stdout.write(l + "\n"),
  };

  const client = new GatewayClient(cfg);
  await client.connect();
  console.log("[gateway-main] connect() resolved; entering long-running loop");

  // Emit synthetic install_completed event (best-effort)
  // (Implementation reuses the recordOutcome HMAC path via a stub; sketch only)
  // ... follow-on detail in Builder commit

  // Keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error("[gateway-main] fatal:", e);
  process.exit(1);
});
```

Maintainer build step: **zero extra work**. `npm run build` (which B4a's build-musu-backend.sh already calls at line 161) compiles `src/gateway/*.ts` → `dist/gateway/*.js` via the existing tsconfig.json. `main.js` falls out alongside `client.js`, `bridge.js`, `wrtc-factory.js`. B4a's `cp -r dist/gateway` then bakes it into the tar.

No `installer/` TypeScript compilation step is required. No separate tsconfig.json. The Critic HIGH #1 broken-compile-recipe goes away entirely.

Operator runtime impact: the `npx tsc --noEmit` gate already runs on the existing tsconfig, so `src/gateway/main.ts` is type-checked as part of `npm test`. If main.ts has a TS error, `npm test` fails (caught at code-write time).

---

## 11. Acceptance criteria

- [ ] 7 new files committed under `musu-relay/installer/` (5 PowerShell + 1 markdown + 2 TS source/compiled)
- [ ] PowerShell scripts pass `[System.Management.Automation.PSParser]::Tokenize($content, [ref]$null)` syntax check (no parse errors)
- [ ] `gateway-main.ts` compiles via `npx tsc` clean
- [ ] `gateway-main.js` is committed alongside `.ts` (release artifact)
- [ ] `installer/install-musu-backend.md` documents install + uninstall + recovery for all 6 host tiers
- [ ] Telemetry payload contract tested (mock signaling endpoint accepts the schema; jest test under `tests/` if reasonably scoped, otherwise PowerShell `Pester` test)
- [ ] `check-prereqs.ps1` returns identical JSON shape regardless of tier (only field values differ)
- [ ] `install-wsl2.ps1 -WhatIf` does not modify host (dry-run support via `[CmdletBinding(SupportsShouldProcess)]`)
- [ ] OPERATOR-GATED: Actual install on a Windows host with B4a tar succeeds for at least 1 tier (lowest-friction is `wsl2-already-on`)
- [ ] OPERATOR-GATED: `uninstall.ps1` is fully idempotent (re-run after partial-state install completes cleanly)
- [ ] OPERATOR-GATED: Reboot path on `wsl2-off-feature-off` tier executed on ≥1 host; Scheduled Task self-deletes after resume
- [ ] OPERATOR-GATED: `wsl -d musu -- cat /etc/musu/gateway.env` returns the 8 expected keys with 0600 mode
- [ ] OPERATOR-GATED: `wsl -d musu -- cat /etc/musu/account_key` returns 64 hex chars; `stat -c %a /etc/musu/account_key` returns `600`
- [ ] OPERATOR-GATED: Gateway connects to signaling within 120s of step 10 (`[gateway] welcomed as peer=` log line)
- [ ] Existing musu-relay test suite stays green (B4b touches no `src/` TypeScript; `gateway-main.ts` lives under `installer/`)
- [ ] `npx tsc --noEmit`: clean
- [ ] `install-failure.json` schema produced on a deliberately-failed install (e.g., bad TunnelToken) and contains NO sensitive fields (tunnel_token, account_key, user_id absent)

---

## 12. Constitution gates

- **Const III (schema)**: NO — `telemetry_install` schema already exists from B1 (v41). B4b only writes to it via gateway-emitted HMAC-signed POSTs; no migration needed. B4c may want a `b4c_host_class` column extension which would be Const III at THAT workstream's time, not B4b.
- **Const VI (experiment)**: NO — B4c is the 30%-gate Const VI experiment. B4b is the installer being tested by B4c.
- **Const VII (push)**: YES — feature-branch push to `v22/gap-analysis` allowed at closure time. Main-branch merge of V23.2 stays gated by the final V23.2 closure (separate doc, after B4c lands).

---

## 13. Critic prep (`system-architect`)

Pre-flighted attack surface so Critic adjudicates the locked decisions + finds anything new. Ten questions:

1. **OQ1 vs OQ1-β.** Is α (installer-bootstraps account_key) really better than β (gateway-bootstraps)? Researcher H1 argued α gives install-time failure UX while β defers failure to gateway crash-loop. But α requires PowerShell to handle a 64-byte hex key in memory + ship via temp file (PS 5.1 cannot SecureString a stdout-bound string reliably). Cost-benefit: is the install-time UX win worth the temp-file exposure window? Lock decision: α stays per orchestrator; Critic adjudicates if attack-surface changes warrant carry-back to β-or-hybrid.

2. **OQ3 vs B4a.1 amendment.** Is shipping `gateway-main.ts` as a B4b deliverable correct vs filing a B4a.1 amendment that updates the tar? B4a is closed (wiki/371); reopening adds delivery cycles. B4b's approach mutates the imported distro via `sed -i` on `openrc-musu-gateway.conf`. Critic: is `sed -i` patching of an OpenRC service file resilient to (a) future B4a tar updates that change the `command_args` format, (b) double-install where sed replaces an already-replaced string into nothing? Suggest: have the installer write a NEW service file `/etc/init.d/musu-gateway-main` and rebuild the runlevel — but that conflicts with B4a's musu-init explicitly invoking `rc-service musu-gateway start`. Lock: stick with `sed -i` + add idempotency check (regex test for already-patched state before sed).

3. **OQ5 Scheduled Task `-AtLogOn` self-deleting.** Is the pattern correctly designed? AV concerns: Defender flags Scheduled Tasks at logon with `powershell.exe -ExecutionPolicy Bypass` as moderate-suspicion. Mitigation: register task as principal `Interactive` (not SYSTEM) with the operator's own UID per v21 precedent (`scripts/install.ps1:367` LogonType Interactive). GPO survival: corporate GPOs sometimes block user-registered Scheduled Tasks; check-prereqs.ps1 `group_policy` probe partially addresses but `SOFTWARE\Policies\Microsoft\Windows\TaskScheduler` is a separate key. Cleanup edge case: if step 12 throws BEFORE `Unregister-ScheduledTask`, the task re-fires on next logon → installer detects already-installed state via the install_id file + state file absence → exits cleanly + unregisters. Critic verifies cleanup-edge correctness.

4. **Temp-file pattern for piping account_key (vs raw stdin).** B4a's `musu-write-key` is CRLF-tolerant per audit-fix M2 (wiki/371 §5 M2). B4b step 9 writes account_key to a temp file FIRST (icacls-restricted), then pipes the file content via `Get-Content -Raw | wsl.exe`. Defense-in-depth — but the temp file lives on disk for ~10ms. Alternative: `[byte[]]` and `Process.StandardInput.BaseStream.Write`. Researcher M3 flagged this as the highest-risk MEDIUM. Critic: is 10ms temp-file exposure acceptable given (a) icacls restricts to current user + SYSTEM only, (b) `Remove-Item -Force` in `finally` is guaranteed, (c) B1's AR-3 (no V8 string-zeroization) already extends to PowerShell? Recommend: yes, acceptable; document in §13 closure carry.

5. **Coverage of all 6 host tiers.** Decision tree in §4.2 covers each path; the `wsl2-off-feature-unknown` case re-elevates and re-probes. Critic: what if re-probe ALSO returns unknown (e.g., third-party security software blocking `Get-WindowsOptionalFeature` even elevated)? Fallback: treat as `wsl2-off-feature-off` (canonical reboot path) with telemetry tagged `feature_state_assumed_off`. Add this fallback to §4.3.

6. **`gateway-main.ts` correctness.** Sketch in §10 has known gaps: (a) `pcFactory` is a stub (T1.9 wrtc factory wiring is master-plan-deferred); the gateway will connect signaling but cannot accept WebRTC offers. Acceptable for B4b's "gateway-up" definition. (b) Synthetic `install_completed` event emission is sketched, not implemented. Builder MUST implement. (c) The `import { GatewayClient } from "./client"` path depends on the maintainer compiling with the right `--rootDir`. Critic adjudicates the exact tsc invocation.

7. **Failure-path local-file dump leaks.** §7 schema explicitly excludes `tunnel_token`, `account_key`, `user_id`. Critic verifies that `host_state` field cannot indirectly leak (no fingerprint of the user via `os_lang` int, no MAC/hardware ID). Researcher confirmed `OSLanguage` is locale code only, not user-specific.

8. **Elevation hop preserves all required args + secures tunnel_token.** `Invoke-MusuElevationHop` writes `$TunnelToken` to a 0600-equivalent temp file via icacls, then passes file path as `-TokenFile` arg. The elevated child reads + deletes. Argv of the child is therefore `... -TokenFile C:\Users\<u>\AppData\Local\Temp\musu-token-<random>.txt` — visible in `Get-Process` ETW but NOT containing the token. Critic verifies the icacls grant string `${env:USERNAME}:F SYSTEM:F` is correct (no inheritance, no Authenticated Users, no admin Users built-in beyond SYSTEM).

9. **Reboot resume + tunnel_token expiry UX.** If operator's tunnel_token expires between reboot and resume (musu.pro could rotate it; or operator could revoke + reissue), step 5's `/api/v1/nodes/validate` returns `valid: false`. Installer prompts operator for fresh token via `Read-Host -AsSecureString`. State file's `tunnel_token_hash` is checked against the new token; if mismatched, installer offers `(R)esume with new token / (A)bort and uninstall`. Critic adjudicates whether this UX is acceptable for prosumer audience or if V23.4 Tauri should be a prereq for B4b GA.

10. **install_id stability across re-installs.** Researcher H10. `%LOCALAPPDATA%\musu\install_id` is read on every install start; if present and well-formed (32 hex chars), reused; otherwise generated fresh. Implication: telemetry rows from re-installs on the same host coalesce under one install_id, which is the desired analytics shape per B1's "musu_install_id PRIMARY KEY" on `telemetry_account_keys`. Critic: this means a `wsl --unregister musu` + re-install will re-use the existing `account_key` row (409 on issue_install_key). Installer must handle 409 by reading the EXISTING account_key from somewhere — but there is no "somewhere" in B4b's surface (PowerShell does not store it; gateway.env has it but the WSL distro is gone after unregister). Recommend: on 409, hard-fail with operator-facing message "An install already exists for this user. Run `uninstall.ps1 -Reset` to wipe the install_id file, then retry." Add `-Reset` flag to uninstall.ps1 that deletes `%LOCALAPPDATA%\musu\install_id`.

Expected Critic verdict: SHIP-OK with 2-3 HIGHs to resolve in-plan:

- **HIGH likely candidate 1**: Step 9 temp-file pattern + `accountKey` PowerShell string lifetime — adjudicate carry to §closure AR-extension or require an immediate mitigation.
- **HIGH likely candidate 2**: `gateway-main.ts` `--rootDir` / `--outDir` exact invocation + the `import { GatewayClient } from "./client"` path resolution — could fail to compile against current `tsconfig.json` `include: ["src"]`.
- **HIGH likely candidate 3**: `sed -i` patching of `openrc-musu-gateway.conf` — fragile; recommend ship full replacement file or idempotency check.

Expected MEDIUMs:

- AV detection robustness (Defender-only probe; Norton/McAfee/Trend Micro silent)
- GPO probe accuracy (only `HKLM:\SOFTWARE\Policies\Microsoft\Windows\WSL`; AppLocker on `wsl.exe` separate)
- Telemetry failure-path consent flow (`user_consent_to_upload` default false → operator never sees prompt → dump rots forever)
- install_id reuse semantics (409 hard-fail UX above)
- Hyper-V conflict (if user has Hyper-V VMs running, `wsl --install` fails with cryptic error; check-prereqs should probe `Get-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All` and warn)

---

## 14. References

- wiki/361 — Workstream B master plan §B4b (lines 139-144)
- wiki/364 — B1 closure §"Critic Findings (resolved)" Finding #1 deferred to B4b; §"Accepted-risk register" AR-1/AR-3 carried forward
- wiki/366 — B2 closure (musu-pro `/api/v1/nodes/validate` returns `user_id` contract — B4b step 5 consumer)
- wiki/368 — B3 closure (admin auth precedent; format reference, no direct dependency)
- wiki/370 — B4a detail plan §4 ABI reservation, §6 musu-init, §13 Critic Findings table
- wiki/371 — B4a closure (operator-gated remaining items; audit-fix M1 removed `[boot]` block, M2 CRLF tolerance in `musu-write-key`, M3 try/finally in `validate-import.ps1`)
- `V23_MASTER_PLAN_2026_05_15.md` §0.5 lines 385-493 (3-tier install flow canonical spec; T1/T2/T3 layer definitions; graceful degradation UI)
- `musu-relay/installer/musu-write-key` (B4a ABI seam; lines 27-78 contract, audit-fix M2 at lines 47-50)
- `musu-relay/installer/musu-init` (B4a orchestrator; lines 38-52 K3s ready gate, lines 58-75 account_key wait)
- `musu-relay/installer/openrc-musu-gateway.conf` (B4a; line 16 `command_args` is the sed-patched target for B4b step 7)
- `musu-relay/src/gateway/client.ts:25-26, 407-480` (HMAC + `bootstrapAccountKey` fallback under OQ1=α)
- `musu-relay/src/signaling/telemetry.ts:553-743` (HMAC `/install` endpoint + `/issue_install_key` route — B4b step 9 consumer)
- `scripts/install.ps1` (v21 481-LOC reference: lines 33-36 logging helpers, 60+122 icacls ACL idiom, 127 token-gen pattern, 319-369 Scheduled Task pattern)
- Microsoft Defender Antivirus `Get-MpPreference` cmdlet docs (`ExclusionPath` enumeration)
- Microsoft `Get-WindowsOptionalFeature` docs (`VirtualMachinePlatform`, `Microsoft-Windows-Subsystem-Linux`)
- Microsoft Task Scheduler `Register-ScheduledTask` + `-AtLogOn` trigger docs

---

---

## 14. Critic Findings (resolved)

`system-architect` Critic completed 2026-05-16 on plan v1. Returned 3 HIGH / 7 MEDIUM / 3 LOW / 1 INFO. Adjudicated and patched inline. Builder (`devops-architect`) reads this table as PRIOR ARTIFACTS; Auditor MUST address every HIGH in HANDOFF NOTES per `MODE_Agent_Team.md` §"Phase 5 Auditor".

| # | Sev | Critic finding | Resolution in plan | Notes for Auditor |
|---|---|---|---|---|
| C1 | **HIGH** | gateway-main.ts compile recipe broken: `tsc --outDir installer installer/gateway-main.ts` cannot resolve `./client` import. `--rootDir src/gateway` would fail because `installer/gateway-main.ts` is not under `src/gateway/`. | **Relocated to `musu-relay/src/gateway/main.ts`**. Existing `tsconfig.json` `include: ["src"]` picks it up; `npm run build` produces `dist/gateway/main.js` alongside other gateway files. B4a's `cp -r dist/gateway` step bakes it into the tar automatically. No separate tsconfig.json, no `--rootDir` shenanigans. Mild OQ9 deviation: ONE new src/ file (no existing src/ files modified). See §3 + §10. | Verify `src/gateway/main.ts` exists and compiles clean via `npx tsc --noEmit`. Verify `npm run build` produces `dist/gateway/main.js`. Verify install-wsl2.ps1 step 7 does NOT try to copy a shim (since it's already in the tar). |
| C2 | **HIGH** | α-path orphan recovery missing. Steps 6-9 can fail independently (e.g., `/issue_install_key` 503 after `wsl --import` succeeded), leaving registered distro + missing account_key + musu-init blocked forever. No cleanup branch. Operator stuck. | Added §5 step 6.5 — try/catch wrapper around steps 7-9 with `wsl --unregister musu` cleanup on throw. Step 6 itself outside wrapper (no distro registered if it throws). Added pre-check probe for existing 'musu' distro + `-ForceReinstall` flag (default off; refuses on collision unless explicit). | Verify install-wsl2.ps1 has the try/catch + `wsl --unregister musu` cleanup. Verify pre-check `wsl -l --quiet \| Where { $_ -eq "musu" }`. Verify `-ForceReinstall` flag works. |
| C3 | **HIGH** | `-TunnelToken` exposed on un-elevated parent command-line for the brief window before elevation hop fires. Other processes can read via `Get-Process \| Select CommandLine`. Elevation hop's temp-file pattern only protects the elevated CHILD, not the parent. | Refuse un-elevated `-TunnelToken` outright. §5 step 1 throws if `!isElevated -and $TunnelToken`. Elevated child's step 5 prompts via `Read-Host -AsSecureString` (console-visible, never logged). `Invoke-MusuElevationHop` temp-file pattern REMOVED entirely — no leak window. | Verify install-wsl2.ps1 has the `throw` on un-elevated `-TunnelToken`. Verify `Invoke-MusuElevationHop` is not present in `Musu-Common.psm1`. Verify step 5 uses `Read-Host -AsSecureString` in fallback path. |
| C4 | MEDIUM | install_id reuse at `%LOCALAPPDATA%\musu\install_id` contradicts §9.3 "ephemeral never tied to identity" — but the plan reuses across re-installs. | Position locked: **per-Windows-user-on-host**. Documented as deliberate choice. Added `-Reset` flag to uninstall.ps1 (§9) that clears the install_id file. Operators wanting fresh telemetry-lineage run `uninstall.ps1 -Reset` before reinstall. | Verify uninstall.ps1 supports `-Reset` and removes `%LOCALAPPDATA%\musu\install_id`. |
| C5 | MEDIUM | `sed -i` patching of `/etc/init.d/musu-gateway` is fragile (silent no-op on already-patched, silent broken-output on future tar updates). | Replaced with full-file atomic replacement via `openrc-musu-gateway-b4b.conf` (new B4b deliverable) shipped by B4b's installer. No sed. Atomic via tmp+mv. (§5 step 7.) | Verify install-wsl2.ps1 step 7 does NOT call `sed`. Verify it does `cat > file.tmp && chmod && mv file.tmp file`. Verify `openrc-musu-gateway-b4b.conf` is shipped. |
| C6 | MEDIUM | `gateway.env` heredoc write is non-atomic; partial write leaves tunnel_token in half-populated file. | Step 8 changed to write `gateway.env.tmp` first, chmod 0600, chown root:root, THEN `mv gateway.env.tmp gateway.env`. Atomic via POSIX rename(2). (§5 step 8.) | Verify step 8 uses `.tmp` + `mv` pattern. |
| C7 | MEDIUM | `user_consent_to_upload` defaults to false but next successful install silently flips to true + uploads → GDPR-adjacent silent telemetry collection. Plus the `/v1/telemetry/install_failed` upload endpoint doesn't exist in B4b anyway. | Removed `Send-MusuPendingFailureDump` silent auto-upload path from §5 step 12. Local file persistence stays for operator-initiated support collection (implicit consent). The upload endpoint + explicit-consent UX deferred to V23.3 follow-on. | Verify install-wsl2.ps1 step 12 does NOT call `Send-MusuPendingFailureDump` automatically. Failure dumps stay on disk; no auto-upload. |
| C8 | MEDIUM | Baked SHA-256 has no CI-enforced sync between installer and tar release. | Added release CI gate to §11 acceptance criteria: pipeline must verify `$ExpectedTarHash` matches `sha256(musu-backend.tar)` from the same build artifact. Improved §5 step 4 error message to include installer version (`$InstallerVersion` baked constant) + recovery instruction. | Verify `$ExpectedTarHash` mismatch error in step 4 prints both installer version and expected vs actual hash. Verify §11 has the CI-gate criterion. |
| C9 | MEDIUM | Reboot resume scheduled task may prompt for re-typed tunnel_token to a hidden console window. | §8 locked: Scheduled Task launches PowerShell with VISIBLE console window (not `-WindowStyle Hidden`). Added max-retry: after 3 logon-triggered re-attempts without token re-supply, task unregisters self + writes final `install-failure.json`. | Verify §8 Scheduled Task Action has no `-WindowStyle Hidden`. Verify max-retry logic exists. |
| C10 | MEDIUM | GPO probe coverage incomplete (only 2 registry keys; misses AppLocker/WDAC paths). | Accepted as known limitation. Added AR-extension to §13: GPO probe is best-effort; corporate hosts may pass prereq and fail at DISM with cryptic errors. Documented operator fallback in runbook. | Verify `install-musu-backend.md` mentions corporate-GPO troubleshooting. |
| C11 | LOW | §4.3 row 4 (`wsl2-off-feature-unknown`) had no fallback when re-elevated re-probe ALSO returns unknown. | Added fallback to §4.3 row 4: "If re-probe still unknown → assume disabled, treat as wsl2-off-feature-off, tag telemetry `feature_state_assumed_off=true`". | Verify §4.3 row 4 has the explicit fallback path. |
| C12 | LOW | Defender exclusion probe is descriptive-only; installer never acts on missing exclusion. | Added §5 step 5.5: if `wsl_not_excluded` AND elevated (always true past step 1), run `Add-MpPreference -ExclusionPath $env:LOCALAPPDATA\musu\wsl` BEFORE `wsl --import`. Uninstall.ps1 removes the exclusion symmetrically. | Verify step 5.5 conditional Add-MpPreference + uninstall reverse. |
| C13 | LOW | B4b doesn't gate Builder on B4a's first-build success (operator-gated items). | Accepted as parallel-velocity choice. §11 notes Builder MAY proceed; the OPERATOR-GATED end-to-end test (§11 line :842) is the integration gate. Position locked. | No code action; documentation only. |
| C14 | INFO | gateway-main.ts pcFactory stub is OK (T1.9 wrtc deferred per master plan). BUT synthetic install_completed event emission is sketched-not-implemented; OQ2 hybrid path is broken without it. | Builder MUST implement install_completed POST in `src/gateway/main.ts`. Reuses HMAC path in `client.ts:489-549` (`recordOutcome` pattern). Added §11 acceptance: "A successful install produces a row in `telemetry_install` with `musu_install_id` matching `%LOCALAPPDATA%\musu\install_id` and `step_failed=NULL`". | Verify Builder implements install_completed emission. Verify §11 has the new acceptance criterion. |

**Adjudication summary**: All 3 Critic HIGHs resolved in-plan. All 7 MEDIUMs resolved or accepted-as-risk. All 3 LOWs resolved. INFO C14 turned into a MUST-DO acceptance criterion.

**Conflict resolution policy** (per `MODE_Agent_Team.md`):
- Auditor wins over Critic on real-code disagreements (EXCEPT Constitution gates stay HIGH).
- Auditor MUST address every HIGH in HANDOFF NOTES — silence is itself a finding.

---

**End of B4b detail plan (wiki/372). Critic complete. Builder (`devops-architect`) cleared to spin up, with §14 + §11 as PRIOR ARTIFACTS.**
