# Release 1.15.0-rc.1 Current-HEAD CPU Matrix Goal Continuation

Date: 2026-06-07 KST
Commit: `f7f45922611e1986947053e94c3525d7b395eb8a`
Machine: `HUGH_SECOND`

## Summary

A fresh current-HEAD packaged WindowsApps runtime CPU scenario matrix was
captured after the agent-control SaaS research and AG UI/UX updates. This
continues the one-machine CPU attribution work and keeps the failed
`HUGH-MAIN` route-attempt diagnostic current.

Promoted evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- post-route target verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- per-scenario evidence:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route` JSON files with the same `20260607-143513-HUGH_SECOND`
  prefix.

Verifier result:

- full matrix verifier `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- packaged command:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

## Route Probe

The route probe was an explicit non-local target attempt:

- target: `HUGH-MAIN`
- command:
  `musu route --target HUGH-MAIN --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_143513"`
- expected token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_143513`
- result: `ok=false`
- `failure_allowed=true`
- `exit_code=1`
- `raw_exit_code=1`
- endpoint timeout:
  `http://192.168.1.192:8949/api/tasks/delegate`

This is valid failed target-route CPU diagnostic evidence. It is not successful
two-machine route proof, not second-PC CPU/matrix proof, and not hosted
MUSU.PRO release relay proof.

## CPU Matrix

| Scenario | Sample | Hot processes | MUSU CPU | Node CPU | WebView2 CPU | Working set | WebView2 helpers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-open | 60.048s | 0 | 0 | 0 | 0.08 | 370.10MB | 6 |
| runtime-started | 60.063s | 0 | 0 | 0 | 0.00 | 370.11MB | 6 |
| dashboard-open | 60.053s | 0 | 0 | 0 | 0.08 | 371.04MB | 6 |
| desktop-open | 60.059s | 0 | 0 | 0 | 0.05 | 370.10MB | 6 |
| post-route | 60.068s | 0 | 0 | 0 | 0.10 | 370.10MB | 6 |

The reported 20% busy-loop did not reproduce. MUSU runtime, bridge runtime,
desktop shell, and Node all stayed at `0`. The highest observed owned WebView2
one-core CPU value was `0.10`.

## Code Audit

Audits run after evidence promotion:

- P2P store-forward relay contract:
  `ok=true`, `fail_count=0`
- Rust background-loop contract:
  `ok=true`, `fail_count=0`, unaudited loop hits `0`, unaudited spawn hits
  `0`, network watcher primitive hits `0`, telemetry flush primitive hits `0`
  except the already allowlisted one-shot uninstall flush
- frontend polling contract:
  `ok=true`, `fail_count=0`, `29/29` low-duty polling call sites, direct
  non-test `setInterval` hits `0`, direct visibility listeners outside shared
  pollers `0`
- process ownership:
  `ok=true`, `fail_count=0`, packaged runtime `1`, packaged desktop shell
  `1`, owned Node `0`, owned WebView2 `6`, orphan repo helpers `0`, bridge
  PID `34860`, bridge health HTTP `200`

Qualitative code-audit result: no high or medium issue was found in the
reviewed CPU, polling, process ownership, and P2P relay boundary surfaces.

## Product And Research Interpretation

The comparable SaaS research still supports the same product boundary:

- MUSU.PRO is the remote input, room, presence, rendezvous, path-selection,
  relay-fallback, notification, and evidence/control plane.
- MUSU Desktop on each device is the executor.
- Web/mobile may send prompts, follow-ups, approvals, cancellations, and status
  requests.
- Local files, shell commands, tools, adapters, CPU budget, process ownership,
  and local/P2P data movement remain on the selected device.
- `Remote control`, `Local execution`, `Local sandbox`, `Cloud task`, and
  `Relay fallback` must remain separate visible states.

The release source boundary is still correctly conservative:

- preview store-forward payload queue exists but remains non-release-grade;
- `/api/v1/relay/connect` and `/api/v1/relay/payload` stay fail-closed for
  release payload transit;
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`;
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`;
- release relay route proof still requires route metadata, `quic_tls_1_3`
  transport proof, and payload delivery proof.

## Release Status

This continuation improves confidence that current HEAD is not busy-looping on
`HUGH_SECOND`, but public release remains No-Go.

Open gates:

- successful current second-PC route proof
- second-PC desktop-open idle CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live MUSU.PRO login/storage/owner-scope P2P proof
- release-grade `quic_relay_tunnel` runtime and payload endpoint
- relay route metadata, transport proof, and payload delivery proof
- support mailbox proof
- Microsoft Store/Partner Center proof

## Next Step Document

The next practical step is not more local localhost/dashboard debugging. It is
physical or remote access to `HUGH-MAIN`, installing the same current MUSU
Desktop build there, and running the second-PC release check without skipping
runtime idle CPU, runtime CPU scenario matrix, or route proof.
