# 2026-06-06 Post Release Relay Payload Preflight Primary Evidence Audit

After adding the distinct fail-closed release relay payload preflight endpoint,
current packaged MUSU Desktop evidence was refreshed on HUGH_SECOND.

Evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-001948-HUGH_SECOND.evidence.json`
- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-002102-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-002155-HUGH_SECOND.desktop-open.evidence.json`
- normal five-scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-003003-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-004121-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- single-machine surface is `local-bridge-only`, `dashboard_required=false`
- bridge is `http://127.0.0.1:1421`
- idle CPU: MUSU `0`, Node `0`, WebView2 `0.18`, working set `361.21MB`,
  hot `0`
- matrix token `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_003003`, task
  `b3583c26-6e3f-442e-bc78-f0654e6b03c0`, max WebView2 `0.08`, max working
  set `361.8MB`
- targeted HUGH-MAIN route timed out to `192.168.1.192:8949`, explicitly
  allowed for diagnostics, then post-route CPU stayed MUSU `0`, Node `0`,
  WebView2 `0`, hot `0`

Clean go/no-go remains No-Go with six blockers:

- multi-device
- second-PC idle CPU
- second-PC runtime CPU matrix
- hosted P2P control-plane proof
- support mailbox
- Store release evidence

Validation rerun passed `npm run test:p2p` `88/88`, `npm run typecheck`, and
P2P store-forward relay contract audit `ok=true`/`fail_count=0`.

Code and document indexing was refreshed with the packaged MUSU local indexer:
`2452 files`, `2717 symbols`, `14293 ms`. gbrain was not rerun because the
same-session blocker remains missing `ZEROENTROPY_API_KEY`, generated/evidence
import failures, `sync.last_commit` not advancing, and
`gstack-brain-sync exited undefined`.

The product boundary remains: MUSU Desktop executes locally; MUSU.PRO is remote
input, room/rendezvous/path-selection/relay-fallback/evidence control plane.
The `/api/v1/relay/payload` endpoint is preflight only and still fail-closed;
it is not release payload transport.
