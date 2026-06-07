# MUSU 1.15.0-rc.1 Current-HEAD Local Desktop Evidence After Relay Recorder

**Wiki ID**: wiki/1011
**Date**: 2026-06-07
**Commit under test**: `66172a054aa718622017a1091ea1b57c7e559928`
**Machine**: `HUGH_SECOND`

## Summary

Current packaged local evidence was refreshed after the Rust release relay
payload route evidence recorder work.

The local desktop path is healthy again:

- MSIX install evidence and single-machine smoke evidence are current.
- process ownership, startup single-instance, and packaged desktop repeated
  activation gates pass.
- desktop-open idle CPU passes from clean git state.
- the five-state runtime CPU scenario matrix passes from clean git state.
- the current target-route CPU diagnostic is captured with an explicitly
  allowed failed `PRIMARY-PC` route probe.

This is still not public release readiness. The run is one-machine evidence
plus a failed target-route diagnostic. It does not prove successful second-PC
execution, live `musu.pro` P2P control-plane proof, release relay byte transit,
support mailbox proof, or Store/Partner Center readiness.

## Promoted Evidence

MSIX install and single-machine smoke:

- `docs\evidence\msix-install\1.15.0-rc.1\20260607-185659-HUGH_SECOND.evidence.json`
- `docs\evidence\msix-install\1.15.0-rc.1\20260607-185659-HUGH_SECOND.verification.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260607-185741-HUGH_SECOND.evidence.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260607-185741-HUGH_SECOND.verification.json`

Process and startup evidence:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-185807-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-185807-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-185807-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-185821-HUGH_SECOND.desktop-single-instance.json`

Runtime CPU evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-190027-HUGH_SECOND.desktop-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-190401-HUGH_SECOND.current-head-after-relay-recorder.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-190401-HUGH_SECOND.current-head-after-relay-recorder.runtime-cpu-scenario-matrix.verification.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder.post-route-target.verification.json`

## Runtime CPU Matrix

The five-state matrix passed with `ok=true`, `fail_count=0`,
`git_dirty=false`, and `musu_exe_release_identity=true`.

Route probe:

- command: `musu route --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_190401"`
- expected token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_190401`
- result: `ok=true`

| Scenario | Sample | Hot processes | MUSU CPU | Node CPU | WebView2 CPU | Working set | WebView2 helpers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-open | 60.05s | 0 | 0 | 0 | 0.08 | 362.71MB | 6 |
| runtime-started | 60.05s | 0 | 0 | 0 | 0.08 | 362.60MB | 6 |
| dashboard-open | 60.05s | 0 | 0 | 0 | 0.05 | 362.66MB | 6 |
| desktop-open | 60.06s | 0 | 0 | 0 | 0.05 | 365.22MB | 6 |
| post-route | 60.05s | 0 | 0 | 0 | 0.08 | 363.57MB | 6 |

The desktop-open idle CPU evidence also passed from clean git state:

- hot process count: `0`
- MUSU CPU: `0`
- Node CPU: `0`
- owned WebView2 max one-core CPU: `0.08`
- owned process count: `8`
- owned WebView2 helper count: `6`
- working set: `361MB`

## Target Route Diagnostic

The target-route diagnostic is valid CPU evidence for a failed target attempt.
It is not successful two-machine proof.

- target: `PRIMARY-PC`
- result: `ok=false`
- `failure_allowed=true`
- exit code: `1`
- output:
  `Error: peer 'PRIMARY-PC' not found. Use: musu peer add --addr <ip:port> --name PRIMARY-PC`
- CPU sample: hot `0`, WebView2 max `0.03`, working set `363.43MB`

The correct target-only verifier invocation passed with:

`-RequiredScenarios post-route -RequirePostRouteTarget -ExpectedPostRouteTarget PRIMARY-PC -RejectSelfPostRouteTarget -RejectLocalPostRouteTarget -AllowFailedPostRouteProbe`

## Go/No-Go Snapshot

Dirty-tree go/no-go after evidence promotion:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`

Open blockers:

- multi-device evidence
- second-machine runtime idle CPU evidence
- second-machine runtime CPU scenario matrix evidence
- support mailbox proof
- Store/Partner Center proof
- live MUSU.PRO P2P control-plane and relay proof
- dirty git until this evidence/docs update is committed

## SaaS Research And AG UI Assessment

The current comparable SaaS recheck still supports the same product boundary.

Closest direct comparators:

- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- GitHub Copilot CLI Remote Control:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- OpenAI Codex product and repo:
  `https://openai.com/codex/`,
  `https://github.com/openai/codex`
- OpenAI Enterprise/Edu release notes for Windows remote control:
  `https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes`

Infrastructure and UI references:

- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- AG-UI protocol:
  `https://docs.ag-ui.com/`,
  `https://github.com/ag-ui-protocol/ag-ui`
- Tailscale connection and DERP docs:
  `https://tailscale.com/docs/reference/connection-types`,
  `https://tailscale.com/docs/reference/derp-servers`

Conclusion:

- MUSU.PRO should be the command center, remote input surface, room/meeting
  surface, rendezvous service, policy surface, evidence index, and relay
  fallback coordinator.
- MUSU Desktop remains the local executor on each device.
- Remote web/mobile input becomes execution only when the selected local
  runtime accepts an authenticated work-order envelope under local policy.
- AG UI must show `Input`, `Executing on`, `Route`, `Evidence`, and
  `Remote control` as separate states.
- Anonymous tunnels or a generic `connected` badge are not acceptable for
  agent control.

## Qualitative Code Audit

No new code changed after the previously validated relay recorder commit,
except evidence and documentation. The reviewed code surface remains the Rust
route-evidence recorder and the P2P release source-contract checks.

Previously completed validation for the code change:

- `cargo fmt --check --manifest-path musu-rs\Cargo.toml`
- `cargo test --manifest-path musu-rs\Cargo.toml route_evidence --lib`:
  `16 passed`
- `cargo check --manifest-path musu-rs\Cargo.toml --bin musu -j 1`
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: expected `ok=false`
- release evidence verifier regression: `ok=true`, `case_count=105`,
  `failed_case_count=0`
- `git diff --check`

Qualitative result: no high or medium issue found in the changed code path.
The remaining risk is product/release completeness, not a detected busy-loop or
local desktop execution defect on `HUGH_SECOND`.

## Next Steps

1. Install the same current MUSU Desktop build on the second Windows machine.
2. Run the second-PC route preflight and fix peer registration before spending
   another full route/CPU sample.
3. Capture successful second-PC route proof, second-PC desktop-open idle CPU,
   and second-PC five-state CPU matrix.
4. Implement the real release `quic_relay_tunnel` byte path and payload
   endpoint before flipping release relay runtime markers.
5. Capture live owner-scoped `musu.pro` P2P/relay evidence, support mailbox
   proof, and Store/Partner Center evidence.
