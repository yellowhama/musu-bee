# MUSU 1.15.0-rc.1 Post Release Relay Payload Preflight Primary Evidence Audit

Date: 2026-06-06

## Summary

After the distinct fail-closed release relay payload preflight endpoint, current
packaged MUSU Desktop evidence was refreshed on HUGH_SECOND.

Result: the local desktop/runtime path is healthy on one machine, but public
desktop release remains No-Go because the required second-PC, live hosted P2P,
support mailbox, and Store gates are still open.

## Product Boundary

The product split is unchanged.

- MUSU Desktop is the local executor.
- MUSU.PRO is remote user input, project/company room coordination,
  rendezvous, path selection, relay-fallback policy, and evidence control
  plane.
- MUSU.PRO must not become the default execution server or default payload
  data path.
- The release relay payload preflight route at `/api/v1/relay/payload`
  remains fail-closed. It validates auth and lease metadata, but does not store
  or transport payload bytes.

## Evidence Refreshed

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-001948-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-002102-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-002155-HUGH_SECOND.desktop-open.evidence.json`
- five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-003003-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-004121-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Evidence Results

MSIX install verification passed with `local-sideload-manual`,
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`, and strict alias mode.

Single-machine smoke passed with:

- `single_machine_surface=local-bridge-only`
- `dashboard_required=false`
- bridge `http://127.0.0.1:1421`
- packaged WindowsApps `musu.exe`
- CLI route checked

Desktop-open idle CPU passed clean git at `ceacf0b6` for `60.041s`:

- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0`
- WebView2 max one-core CPU: `0.18`
- total working set: `361.21MB`
- hot process count: `0`

Five-scenario runtime CPU matrix passed verifier `ok=true` and `fail_count=0`
from clean git at `a4c545fc`:

- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_003003`
- route task: `b3583c26-6e3f-442e-bc78-f0654e6b03c0`
- max MUSU CPU: `0`
- max Node CPU: `0`
- max WebView2 CPU: `0.08`
- max working set: `361.8MB`

Targeted HUGH-MAIN post-route CPU diagnostic passed verifier `ok=true` and
`fail_count=0` from clean git at `c688c25c`:

- target: `HUGH-MAIN`
- route target address attempted by peer list: `192.168.1.192:8949`
- route result: timed out, explicitly allowed for this diagnostic
- post-route MUSU CPU: `0`
- post-route Node CPU: `0`
- post-route WebView2 CPU: `0`
- post-route working set: `359.39MB`

## Go/No-Go

Clean go/no-go after the targeted evidence commit reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines: `1/2 [HUGH_SECOND]`
- runtime CPU matrix valid machines: `1/2 [HUGH_SECOND]`
- targeted second-PC route CPU valid machines: `1/1 [HUGH_SECOND]`
- `p2p_store_forward_relay_contract_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open idle CPU evidence
- second-PC five-scenario runtime CPU matrix evidence
- live `https://musu.pro` owner-scoped release-grade P2P control-plane proof
- operator-verified `musu@musu.pro` mailbox delivery
- Partner Center / Store release evidence

## Code Audit

No runtime source files changed in the evidence refresh commits. The relevant
relay source from the prior endpoint work was revalidated.

Validation:

- `npm run test:p2p`: `88/88` pass
- `npm run typecheck`: pass
- `audit-p2p-store-forward-relay-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1` for normal matrix: `ok=true`,
  `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1` for targeted HUGH-MAIN diagnostic:
  `ok=true`, `fail_count=0`
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`: No-Go only on
  external/second-machine/live-service gates listed above

Qualitative assessment:

- The local desktop product is behaving coherently: packaged runtime starts,
  local bridge is healthy, dashboard is optional, and local CLI route works.
- No idle busy-loop is visible on HUGH_SECOND under desktop-open, matrix, or
  failed-target post-route conditions.
- The relay payload preflight separation is correct: release endpoint status
  can be audited without pretending the preview queue is release transport.
- The main release risk is not local runtime stability on this machine. It is
  missing proof from another Windows PC plus missing live `musu.pro` relay/KV
  configuration and release-grade payload transport evidence.

## Code And Document Indexing

MUSU local indexing was refreshed after this report and the related wiki/spec
updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2452`
- symbols: `2717`
- elapsed: `14293 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
`AGENTS.md` GBrain Search Guidance remains intentionally absent until
semantic/symbol search is verified on this Windows machine.

## Next Steps

1. Install the same current MUSU build on the second Windows PC and return
   second-PC MSIX, single-machine, idle CPU, runtime matrix, and multi-device
   route evidence.
2. Configure live `musu.pro` P2P control auth plus KV/Upstash relay lease
   storage and record owner-scoped live P2P evidence without `AllowUnverified`.
3. Implement release-grade relay payload transport and delivery proof before
   flipping `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
4. Verify `musu@musu.pro` mailbox delivery.
5. Record Partner Center product reservation, Store submission, certification,
   and restricted capability approval evidence.
