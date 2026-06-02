# MUSU 1.15.0-rc.1 Post Status JSON Primary Evidence

Date: 2026-06-03 02:25 KST
Packaged source commit: `e27270255c7b23400d1a09ca5f0514060cb98384`
Evidence commits: `640cd1234d5286d85238683fcd8fed1176c8463d`, `043999d8a89f2a982e5316ec6e4d266718a46184`

## Verdict

Public desktop release remains **No-Go**.

The local packaged evidence is current again after `musu status --json`
hardening. The busy-loop report is not reproduced on the primary machine in
current packaged desktop evidence. MUSU runtime and desktop CPU are effectively
idle, and the remaining high machine-wide `node.exe` count is Codex/MCP
background work, not MUSU-owned Node.

Release remains blocked by external/proof gates: second-PC runtime idle CPU,
second-PC four-state CPU matrix, real second-PC route evidence, live
`musu.pro` KV/Upstash owner-scoped P2P/relay evidence, release-grade route
transport proof, `musu@musu.pro` support mailbox evidence, and Microsoft
Store/Partner Center submission evidence.

## Current Evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| MSIX rebuild/install | Pass | `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix` |
| Desktop single instance | Pass | `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-single-instance.json` |
| Process ownership | Pass | `docs\evidence\process-ownership\1.15.0-rc.1\20260603-021134-HUGH_SECOND.process-ownership.json` |
| Single-machine smoke | Pass | `docs\evidence\single-machine\1.15.0-rc.1\20260603-021321-HUGH_SECOND.evidence.json` |
| Desktop-open idle CPU | Pass on HUGH_SECOND | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-open.evidence.json` |
| Four-state CPU matrix | Pass on HUGH_SECOND | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-021552-HUGH_SECOND.runtime-cpu-scenario-matrix.json` |

Single-machine smoke:

- dashboard task: `9eaa450f-a9ee-4924-8d50-67a464e1eba7`
- output: `MUSU_RELEASE_SMOKE_OK_20260603_021259`
- bridge: `http://127.0.0.1:6270`
- CLI route checked: `true`

Desktop/process audit:

- repeated desktop activation: before `0`, after `1`, new shell `1`
- runtime process count: `1`
- desktop shell count: `1`
- MUSU-owned Node: `0`
- MUSU-owned WebView2: `6`
- machine-wide Node: `16`
- orphan repo helpers: `0`

CPU evidence:

- desktop-open 60.058s sample, `git_dirty=false`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.13`
- desktop-open working set: `367.91MB`
- hot process count: `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_021552`
- matrix scenarios: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- matrix max working set: `508.42MB`
- matrix max observed one-core CPU: MUSU `0.03`, WebView2 `0.34`

## Go/No-Go State

Clean go/no-go on manifest commit `043999d8a89f2a982e5316ec6e4d266718a46184`
reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `msix_install_verified=true`
- runtime idle CPU valid machines: `1/2 [HUGH_SECOND]`
- runtime CPU matrix valid machines: `1/2 [HUGH_SECOND]`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `public_metadata_ok=true`
- `manifest_dirty=false`

The CPU gates are intentionally still `verified=false` because the release
policy requires two valid machines. Current primary evidence closes the local
busy-loop concern for HUGH_SECOND; it does not replace second-PC evidence.

## Code Audit

No new critical local desktop issue was found in this evidence refresh.

Audited behavior:

- `musu status --json` is now packaged and usable for machine-readable fleet
  status.
- The local-sideload MSIX installs and launches the packaged desktop shell.
- Repeated desktop activations do not spawn duplicate `musu-desktop.exe`
  shells.
- Process ownership separates MUSU-owned helpers from unrelated machine-wide
  Codex/MCP Node processes.
- Desktop-open and route-adjacent CPU evidence stays within budget with no hot
  process.

Known issues remain:

- The local developer PATH still has `C:\Users\empty\.cargo\bin\musu.exe`
  before the WindowsApps execution alias. Packaged evidence must keep using
  `$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe` explicitly.
- `musu.pro` P2P is still control-plane wiring without live KV-backed
  owner-scoped lease proof.
- Release route evidence still lacks release-grade QUIC/TLS transport proof.
- second-PC route/CPU/matrix evidence is still the biggest remaining release
  blocker.

## Next Steps

1. Run the current second-PC release pack and import a return zip that includes
   runtime idle CPU, runtime CPU matrix, process attribution, and release-check
   JSON.
2. Provision KV/Upstash values for `musu.pro`, redeploy, and record owner-scoped
   P2P/relay evidence.
3. Record `musu@musu.pro` support mailbox delivery evidence.
4. Prepare Partner Center submission evidence after second-PC and P2P gates are
   closed.
