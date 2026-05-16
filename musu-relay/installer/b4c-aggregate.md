# B4c — 30% gate experiment operator runbook

Runbook for V23.2 Workstream B4c: the Constitution VI experiment that decides whether the α-path (WSL2-on-Windows-first install pipeline) graduates to V23.3, or whether the project pivots to the β-path. References wiki/361 §B4c, wiki/374 (plan), wiki/375 (closure template).

## Prerequisites

- B4a tar built and SHA-256 sidecar present (`musu-backend.tar` + `musu-backend.tar.sha256`)
- B4b installer files committed (`installer/install-wsl2.ps1` etc.)
- A `bash` shell with `jq` installed (Linux, WSL2, macOS — `apt install jq` / `brew install jq`)
- 5 Windows hosts (or 5 VM snapshots) representing the 5 canonical `b4c_host_class` values:
  - `wsl2-already-on` — WSL2 working, no `musu` distro
  - `wsl2-off-feature-on` — VirtualMachinePlatform enabled but no distro / WSL2 default
  - `wsl2-off-feature-off` — VirtualMachinePlatform disabled (reboot path required)
  - `no-bios-vt-simulated` — BIOS-VT off (or simulated off via VM firmware setting)
  - `fresh-win-vm` — Clean Windows 11 install, nothing configured

A reasonable subset:
- VM snapshot 1: Win11 23H2 with WSL2 + Ubuntu installed → `wsl2-already-on`
- VM snapshot 2: Win11 23H2 with VirtualMachinePlatform enabled, no distros → `wsl2-off-feature-on`
- VM snapshot 3: Win11 23H2, fresh install, no WSL2 → `wsl2-off-feature-off`
- VM snapshot 4: Win11 23H2 with VT-x disabled in VM firmware → `no-bios-vt-simulated`
- VM snapshot 5: Win11 23H2 OOBE-complete only → `fresh-win-vm`

## Procedure per host

1. **Copy artifacts** to the Windows host: `musu-backend.tar`, `musu-backend.tar.sha256`, and the contents of `musu-relay/installer/` (all `.ps1`, `.psm1`, `.conf`, `.md`, and the `gateway-main.js` once it's been compiled via `npm run build`).

2. **Elevated PowerShell**, run:
   ```powershell
   .\install-wsl2.ps1 -TarPath .\musu-backend.tar `
                      -ExpectedSha256 (Get-Content .\musu-backend.tar.sha256 -Raw).Trim() `
                      -HostClass "<one of: wsl2-already-on | wsl2-off-feature-on | wsl2-off-feature-off | no-bios-vt-simulated | fresh-win-vm>"
   ```
   The installer will prompt for `-TunnelToken` interactively (Read-Host -AsSecureString) per the Critic C3 resolution.

3. **Wait** for completion. The installer's step 11 waits up to 120s for the gateway to log `[gateway-main] connect() resolved`. If the host_class triggers a reboot (wsl2-off-feature-off), the Scheduled Task resumes installation post-logon.

4. **Capture** the `validation-result.json`. `validate-import.ps1` writes to CWD (the directory you launched PowerShell from), NOT `%LOCALAPPDATA%`. Rename per host:
   ```powershell
   # Run validate-import.ps1 from a known directory:
   cd C:\musu-b4c
   .\validate-import.ps1 -TarPath .\musu-backend.tar -ExpectedSha256 (Get-Content .\musu-backend.tar.sha256 -Raw).Trim()
   # validation-result.json now lives at C:\musu-b4c\validation-result.json
   Copy-Item .\validation-result.json .\b4c-host-<n>-<class>.json
   ```
   (Final security audit wiki/377-audit LOW finding: prior version of this runbook
   referenced `%LOCALAPPDATA%\musu\validation-result.json` — that is the
   `install-failure.json` convention, NOT `validation-result.json`. Fixed here;
   V23.3 may move both to `%LOCALAPPDATA%\musu\` for parity.)

5. **Sanity-check telemetry**: from any host with admin secret + curl:
   ```bash
   curl -H "Authorization: Bearer $MUSU_TELEMETRY_ADMIN_SECRET" \
        https://signaling.musu.pro/v1/telemetry/summary
   ```
   The `install.total` counter should have incremented; `install.failures` shows non-NULL `step_failed` rows.

6. **Reset** the VM snapshot back to the pre-install state (or run `uninstall.ps1 -Reset`) before the next host.

## Aggregate the 5 results

Once you have 5 JSON files:

```bash
cd /path/to/musu-relay/installer
./b4c-aggregate.sh ../../b4c-host-1-wsl2-already-on.json \
                   ../../b4c-host-2-wsl2-off-feature-on.json \
                   ../../b4c-host-3-wsl2-off-feature-off.json \
                   ../../b4c-host-4-no-bios-vt-simulated.json \
                   ../../b4c-host-5-fresh-win-vm.json \
                   > ../../b4c-result.json

# Inspect:
jq '.gate_decision, .success_rate, .host_class_distribution, .failure_breakdown_by_class' \
  ../../b4c-result.json
```

## Decision recording

Open `docs/V23_2_WORKSTREAM_B4C_CLOSURE_2026_05_16.md` (wiki/375). Fill in:
- The 5 host descriptions
- The `b4c-result.json` excerpt
- The `gate_decision` verbatim
- A narrative reasoning paragraph

If `gate_decision = alpha`: V23.3 work continues on the α-path (musu-bridge as K3s Pod, etc.).
If `gate_decision = beta`: V23.3 planning records the dominant failure mode + the β-path retreat (likely Docker Desktop hard-require OR Debian-slim K3s base OR drop K3s entirely).
If `gate_decision = abort_payload_inconsistent`: the 5 hosts ran different tars; rebuild from one tar, re-run experiment.
If `gate_decision = insufficient_diversity`: extend host_class coverage; re-run with more host classes represented.

## Troubleshooting

- `b4c-aggregate.sh: jq: command not found` — install jq: `sudo apt install jq` / `brew install jq` / `winget install jqlang.jq`.
- All hosts return `k3s_ready_status: never_started` → B4a K3s spike outcome was wrong; revisit `openrc-k3s.conf` `command_args`. Closure doc should record this as a B4a regression, not a B4c failure.
- `tar_sha256_consistent: false` → operator ran different tars on different hosts. Pick one tar, retry. Do NOT record the run as B4c gate data.
- Host_class probe disagreed with operator expectation → check-prereqs.ps1 C11 fallback may have downgraded `unknown` to `wsl2-off-feature-off`. Compare the operator's `-HostClass` arg with what the script actually wrote to `validation-result.json`.

## Out of scope

- Anonymizing `b4c_host_id`. Per V23 master plan §9.3, telemetry is ephemeral. Operators can set `$env:COMPUTERNAME = "host1"` before running install to override.
- Server-side aggregation. The jq-on-validation-result.json pattern keeps B4c blast radius to 3 new files; a `/v1/telemetry/summary/by-host-class` endpoint would need Const III review.
- B4c.2 retry experiment. If the first B4c lands β and the operator wants a re-run after a targeted fix, that's a new workstream.

## References

- wiki/361 §B4c (master plan)
- wiki/370 §7.2 (validation-result.json schema + b4c_host_class enum)
- wiki/373 (B4b closure — install_wsl2.ps1 reference)
- wiki/374 (B4c plan — this script's design contract)
- wiki/375 (B4c closure — α/β decision template)
