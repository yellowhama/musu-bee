# Release 1.15.0-rc.1 Current-HEAD CPU Matrix After Agent Control Research

Date: 2026-06-07
Commit: `13dcd4677fde12daa6454b4064ca14da55b3a3ae`

## Summary

After the agent-control SaaS research and AG UI/UX design supplement, a fresh
HUGH_SECOND runtime CPU scenario matrix was captured from a clean git state with
the packaged WindowsApps MUSU command.

Promoted evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- post-route target verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- per-scenario evidence:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route` JSON files with the same `20260607-141207-HUGH_SECOND`
  prefix.

Verifier result:

- full matrix `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- `operator_machine=HUGH_SECOND`

## Route Probe

The route probe was an explicit non-local target attempt, not a successful
route:

- target: `HUGH-MAIN`
- command:
  `musu route --target HUGH-MAIN --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_141207"`
- expected token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_141207`
- result: `ok=false`
- `failure_allowed=true`
- `exit_code=1`
- `raw_exit_code=1`
- endpoint timeout:
  `http://192.168.1.192:8949/api/tasks/delegate`

This is valid post-route CPU diagnostic evidence for an attempted second-PC
route target. It is not successful route proof, not second-PC matrix evidence,
and not hosted MUSU.PRO P2P release proof.

## CPU Matrix

| Scenario | OK | Sample | Hot processes | MUSU CPU | Node CPU | WebView2 CPU | Working set | WebView2 helpers |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-open | true | 60.047s | 0 | 0 | 0 | 0.10 | 370.13MB | 6 |
| runtime-started | true | 60.061s | 0 | 0 | 0 | 0.08 | 370.07MB | 6 |
| dashboard-open | true | 60.056s | 0 | 0 | 0 | 0.03 | 370.07MB | 6 |
| desktop-open | true | 60.045s | 0 | 0 | 0 | 0.10 | 370.08MB | 6 |
| post-route | true | 60.058s | 0 | 0 | 0 | 0.13 | 370.08MB | 6 |

The reported 20% busy-loop did not reproduce in this clean HUGH_SECOND matrix.
MUSU runtime, bridge runtime, desktop shell, and Node all stayed at `0`.
The highest observed one-core CPU was an owned WebView2 helper at `0.13`.

## Product Boundary

The research supplement does not change the runtime contract:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is the remote input, project room, presence, rendezvous, path
  selection, relay fallback, and evidence/control plane.
- Remote control can sync prompts, plans, approvals, cancellations, and status.
- Local files, shell commands, tools, browser/app automation, CPU budget, and
  P2P data movement remain on the selected MUSU Desktop device.
- UI must distinguish `Remote control`, `Local execution`, `Local sandbox`,
  `Cloud task`, and `Relay fallback`.

## Release Meaning

This refresh improves current-head CPU confidence and keeps the target-route
diagnostic current after the SaaS research/AG UX docs commit. Public release
remains No-Go until the remaining external gates are satisfied:

- real second-PC route success proof
- second-PC desktop-open idle CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live MUSU.PRO P2P control-plane login/storage/relay proof
- release `quic_relay_tunnel` runtime and payload endpoint
- release relay route transport proof and payload delivery proof
- support mailbox evidence
- Microsoft Store evidence
