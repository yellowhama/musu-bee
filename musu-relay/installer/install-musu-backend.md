# Installing musu-backend on Windows

Operator runbook for `musu-relay/installer/install-wsl2.ps1` — the Windows-side
PowerShell installer that turns B4a's `musu-backend.tar` into a running
musu-gateway. Covers V23.2 Workstream B4b (wiki/372).

## Pre-requisites

- Windows 10 build 19041 (2004) or newer, OR Windows 11
- PowerShell 5.1 or newer (preinstalled; `pwsh` 7+ also works)
- Elevated PowerShell prompt (the installer self-elevates via UAC if not)
- ~5 GB free disk on the `%LOCALAPPDATA%` drive (musu WSL distro lives there)
- BIOS-VT (Intel VT-x / AMD-V / SVM) enabled in firmware
- Network: outbound HTTPS to `https://signaling.musu.pro` and `https://musu.pro`
- A musu.pro tunnel token (obtain from your musu.pro account dashboard)

If you don't yet have the `musu-backend.tar` file, build it from a Linux/WSL
host using `musu-relay/installer/build-musu-backend.sh` (or the
`build-musu-backend.ps1` wrapper from Windows with a Docker daemon).

## Quick install (happy path)

From an **elevated** PowerShell prompt:

```powershell
cd C:\path\to\musu-relay\installer
.\install-wsl2.ps1 -TunnelToken <your-tunnel-token>
```

On `wsl2-already-on` hosts (most developer machines that have run any prior
WSL2 distro), this completes in ~60 seconds without a reboot. On a fresh
clean Windows VM (`wsl2-off-feature-off`), expect one reboot and ~3 minutes
total.

Don't have the token handy? Run without `-TunnelToken` and the elevated
installer will prompt securely via `Read-Host -AsSecureString`:

```powershell
.\install-wsl2.ps1
```

**Security note**: never pass `-TunnelToken` from an un-elevated PowerShell
prompt. The installer refuses outright because the un-elevated parent
exposes the token to other processes via `Get-Process | Select CommandLine`
(Critic HIGH #3 / C3 resolution).

## Per-tier install flow

The installer auto-detects host state via `check-prereqs.ps1` and classifies
into one of six `b4c_host_class` values. The flow differs per tier:

### `wsl2-already-on` (no reboot, no DISM)

WSL2 is active, no `musu` distro yet. Lowest friction.

1. install_id reuse + elevation (self-elevates via UAC if needed)
2. `wsl --import musu` from the staging tar
3. Atomic OpenRC service file replace
4. Atomic `gateway.env` write (umask 077, 0600 root:root)
5. POST `/v1/telemetry/issue_install_key` → pipe to `musu-write-key`
6. `openrc default` → K3s + gateway start
7. Wait for `[gateway-main] connect() resolved` (≤120s)

### `wsl2-off-feature-on` (no reboot)

Feature flags are on but WSL2 isn't the default. Adds a `wsl --install
--no-distribution --no-launch` step before import.

### `wsl2-off-feature-off` (one reboot — the canonical V23 §0.5 path)

VirtualMachinePlatform and WSL features are off.

1. DISM enable VirtualMachinePlatform + WSL (no-restart)
2. Save state to `%ProgramData%\musu\install-state.json`
3. Register `musu-install-resume` Scheduled Task (`-AtLogOn`)
4. `Restart-Computer -Confirm -Force`
5. On logon: Scheduled Task fires installer with `-ResumeAfterReboot`
6. Resume continues at the import step

The Scheduled Task uses a **visible** PowerShell console (no
`-WindowStyle Hidden` per Critic C9). If the operator did NOT pass
`-TunnelToken` on the initial call, the resumed installer prompts via
`Read-Host -AsSecureString`. Max 3 retries; after 3 logon-triggered
failures the task self-unregisters and writes a final failure dump.

### `wsl2-off-feature-unknown` (one UAC prompt)

`Get-WindowsOptionalFeature` failed without elevation. Installer re-elevates
and re-probes. If STILL unknown post-elevation, falls back to
`wsl2-off-feature-off` (canonical reboot path) with telemetry tagged
`feature_state_assumed_off=true` (C11 LOW resolution).

### `no-bios-vt-simulated` (hard fail)

BIOS-VT is off (or unknown without `-AllowUnknownBiosVt`). Installer prints
firmware-enable instructions and exits 1. Override with
`-AllowUnknownBiosVt` if you've confirmed BIOS-VT is on but the probe is
unreliable (some OEM laptops misreport).

### `fresh-win-vm` (B4c experimental)

Operator-asserted via `-HostClass fresh-win-vm`. Treated like
`wsl2-off-feature-off` for telemetry but skips the BIOS-VT probe. Used by
B4c experimenters running on a clean Windows VM with pre-enabled features.

## Uninstall

```powershell
.\uninstall.ps1           # tear down distro + state, preserve install_id
.\uninstall.ps1 -Reset    # full clean, also clears install_id
```

`-Reset` clears `%LOCALAPPDATA%\musu\install_id`, which makes the next
install generate a fresh `musu_install_id`. Without `-Reset`, telemetry
rows from re-installs coalesce under one identity (Critic C4 MED — this
is intentional per-Windows-user-on-host behavior).

`uninstall.ps1` is fully idempotent: re-running on an already-clean host
exits 0. It also removes the Defender exclusion that `install-wsl2.ps1`
step 5.5 added (Critic C12 LOW symmetric).

## Troubleshooting

### "K3s never went Ready within 180s"

The K3s API server inside the WSL distro didn't reach `Ready` state in time.
Common causes:

- AV scanning the `*.tar` import → add Defender exclusion for
  `%LOCALAPPDATA%\musu\wsl` (installer step 5.5 does this automatically for
  Defender; third-party AV must be configured manually)
- Corporate GPO blocking K3s ports → see "Corporate GPO" below
- Slow disk / SSD endurance issues during the airgap image import

Recovery: `.\uninstall.ps1 -Reset` then `.\install-wsl2.ps1` again. If the
problem persists, run `wsl -d musu -- tail -200 /var/log/musu-init.log` to
see where K3s got stuck.

### "WSL feature enable failed" / reboot loop

DISM failed to enable VirtualMachinePlatform or WSL. Usually means another
process is holding the servicing API.

- Reboot the host, then re-run `install-wsl2.ps1`
- Check `Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform`
  manually — if state is "Disabled" but reboot is required, you may need to
  power-cycle (not just restart)

### "tar SHA-256 mismatch" — installer version mismatch

Error message will print the installer version, expected hash, and actual
hash. The two most common causes:

- You re-downloaded the tar but kept an older installer (or vice versa).
  Solution: re-download the matching pair from the same release.
- Dev build with stale baked hash. Solution: regenerate the sidecar:

  ```powershell
  (Get-FileHash $TarPath -Algorithm SHA256).Hash.ToLower() |
      Set-Content "$TarPath.sha256"
  ```

  Then re-run the installer; with `$ExpectedTarHash = "<UNSET>"` (dev
  default), the sidecar fallback path accepts it.

### Corporate GPO blocking WSL

`HKLM:\SOFTWARE\Policies\Microsoft\Windows\WSL\AllowWSL = 0` blocks WSL
entirely. AppLocker can independently block `wsl.exe` (separate registry
path; outside B4b's probe coverage per Critic C10 MED).

- `check-prereqs.ps1` reports `group_policy: blocked` for the WSL key
- For AppLocker: contact your IT admin to allow `wsl.exe` and the
  `%LOCALAPPDATA%\musu\wsl\ext4.vhdx` storage path

### Antivirus interaction (Defender auto-handled; third-party manual)

Installer step 5.5 runs `Add-MpPreference -ExclusionPath
$env:LOCALAPPDATA\musu\wsl` automatically when Defender is detected and the
path is not already excluded. Third-party AV (Norton, McAfee, Trend Micro,
etc.) cannot be probed from PowerShell; if you're on one of those, manually
add an exclusion before running the installer to avoid mid-import
quarantine.

### musu distro name collision (`-ForceReinstall`)

If a prior install left a `musu` distro registered (or a different product
happens to use the same name), the installer refuses by default:

> A 'musu' WSL distro already exists. Run uninstall.ps1 first, or re-run
> install-wsl2.ps1 with -ForceReinstall to overwrite (destroys K8s state
> inside).

To overwrite (destroying any state inside the existing distro):

```powershell
.\install-wsl2.ps1 -TunnelToken <hex> -ForceReinstall
```

For a cleaner state, prefer `.\uninstall.ps1 -Reset` first.

### Reboot resume — Scheduled Task self-deletes

After a successful reboot resume, step 12 calls `Unregister-MusuResumeTask`
to remove the `musu-install-resume` Scheduled Task. If the task fires on a
subsequent logon (e.g., a second user account on the same machine), the
installer detects already-installed state via the install_id file + state
file absence and exits cleanly.

After 3 failed retries (state file `retry_count >= 3`), the task
self-unregisters and writes a final `install-failure.json`. Recover with
`.\uninstall.ps1 -Reset`.

## Dev mode escape hatches

### `$ExpectedTarHash = "<UNSET>"` accepts sidecar fallback

Open `install-wsl2.ps1` and look near the top for:

```powershell
$ExpectedTarHash  = "<UNSET>"
$InstallerVersion = "B4b-dev"
```

`<UNSET>` is the dev default; the sidecar `musu-backend.tar.sha256` fallback
kicks in. To pin a release-time hash, replace `<UNSET>` with the lowercase
hex SHA-256 of the canonical tar.

### Recovery from a wedged mid-state install

If the installer crashed mid-way and left orphan state:

```powershell
.\uninstall.ps1 -Reset
.\install-wsl2.ps1 -TunnelToken <hex>
```

The `-Reset` flag clears `install_id` so the retry gets a fresh telemetry
identity. Without it, the retry coalesces under the original install_id —
useful for support correlation, but a clean retry is usually what you want.

## References

- `V23_MASTER_PLAN_2026_05_15.md` §0.5 (3-tier install flow canonical spec)
- `docs/V23_2_WORKSTREAM_B4A_PLAN_2026_05_16.md` (wiki/370 — tar build + ABI)
- `docs/V23_2_WORKSTREAM_B4B_PLAN_2026_05_16.md` (wiki/372 — this installer's plan)
- `musu-relay/installer/musu-write-key` (B4a ABI seam for account_key write)
- `musu-relay/installer/musu-init` (B4a first-boot orchestrator inside WSL)
- `musu-relay/src/gateway/main.ts` (B4b gateway entry-point with install_completed emission)
