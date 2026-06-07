# MUSU 1.15.0-rc.1 One-Machine MUSU.PRO Connection Functional Roadmap

Date: 2026-06-07 21:11 KST

## Scope

This roadmap narrows the next product milestone to one Windows machine:

- MUSU Desktop is installed and running locally.
- MUSU Desktop connects to `https://musu.pro` as the authenticated local
  executor for this device.
- A user can enter work from MUSU.PRO.
- The work is delivered to this local MUSU Desktop instance.
- The local runtime executes the work on this machine and returns status,
  result, and evidence.

This is intentionally not the two-machine release gate. The second Windows
machine cannot be validated until this one-machine Desktop plus MUSU.PRO flow
is reliable enough to install elsewhere.

## Current State

Current repository HEAD before this documentation pass:

- branch: `harden-relay-fallback-payload-evidence`
- commit: `7501f588`
- working tree: clean

Latest go/no-go before this documentation pass:

- generated at `2026-06-07T21:00:52.1567414+09:00`
- manifest commit: `f158336ac3fec3481ea4160bb1351485c6e10a63`
- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `public_metadata_ok=true`
- runtime idle CPU valid machines `1/2`
- runtime CPU scenario matrix valid machines `1/2`
- targeted route-attempt CPU diagnostic valid machines `1/1`
- `p2p_control_plane_env_ready=false`

Current one-machine evidence already proves that the packaged local Desktop
runtime is viable on `HUGH_SECOND`:

- MSIX install evidence exists and passes.
- single-machine smoke passes.
- process ownership passes.
- startup single-instance passes.
- packaged desktop single-instance passes.
- desktop-open 60s idle CPU passes on this machine.
- full runtime CPU matrix passes on this machine.
- idle busy-loop candidate source contracts pass.
- `https://musu.pro/privacy` and `https://musu.pro/support` both pass public
  metadata verification and contain `musu@musu.pro`.

The repeated `ERR_CONNECTION_REFUSED` at `http://127.0.0.1:3001/app` is not the
packaged Desktop success criterion. That port is a separate local dashboard/dev
surface. The packaged local bridge evidence currently uses its discovered
runtime bridge URL, for example `http://127.0.0.1:9741` in the latest local
Desktop report.

## Product Boundary

The first product target is not "make localhost work from the browser".

The first product target is:

> Order work through MUSU.PRO; execute it on the selected local MUSU Desktop
> device; show the user where it ran and what evidence proves it.

MUSU.PRO may receive input, host rooms, display device presence, dispatch
bounded work-order envelopes, collect status, and retain evidence. It must not
be treated as the default execution runtime.

## One-Machine Success Criteria

The one-machine milestone is complete only when the same current build proves
all of the following on this PC:

1. Clean start
   - installed MUSU Desktop starts from the packaged entrypoint;
   - stale processes, orphan bridge records, duplicate runtime, and alias
     shadowing are absent;
   - the local bridge URL is discovered from Desktop/runtime state, not hard
     coded to `127.0.0.1:3001`.

2. MUSU.PRO login and device registration
   - this device has a valid MUSU.PRO account token or equivalent scoped
     control credential;
   - MUSU.PRO receives a heartbeat/presence record for this device;
   - the visible device record includes device name, version, online state,
     runtime capability, and local-executor execution locus.

3. Remote work input from MUSU.PRO
   - a user creates a work order in MUSU.PRO for this room/device;
   - the work order is scoped to owner, company/project/room, target device,
     permission envelope, and trace id;
   - the work order does not include unbounded command execution rights.

4. Local pickup and execution
   - MUSU Desktop accepts the authenticated work-order envelope;
   - local policy validates the command/action allowlist;
   - execution occurs on this Windows machine;
   - the run records local runtime PID/role attribution and execution locus.

5. Result and evidence return
   - MUSU Desktop reports queued, picked up, executing, completed/failed, and
     cancelled states back to MUSU.PRO;
   - MUSU.PRO shows the result without implying cloud execution;
   - evidence records include local device id, bridge/runtime identity,
     command audit result, CPU/resource sample linkage, and any route policy
     used for delivery.

6. Idle/resource stability after the remote run
   - post-run 60s idle CPU stays under the existing one-logical-core budget on
     this machine;
   - MUSU/WebView2/node/bridge roles remain attributable;
   - no polling, heartbeat, readiness, frontend refetch, relay drain, or
     telemetry loop becomes hot after remote input.

## Implementation Roadmap

### Phase 1 - Local Desktop Baseline

Keep this phase green before changing MUSU.PRO remote input behavior.

- Preserve current packaged MSIX/Desktop evidence.
- Keep `localhost:3001` out of release success messaging.
- Add or reuse a Desktop status command that prints the actual local bridge URL,
  process roles, account login state, and device registration state.
- Re-run single-machine smoke and desktop-open idle CPU after any runtime or
  Desktop source change.

### Phase 2 - MUSU.PRO Device Presence

Make the one local Desktop show up as an executor on MUSU.PRO.

- Verify account token loading from the packaged runtime.
- Publish room/device presence from the local Desktop heartbeat.
- Include candidate endpoints and capabilities, but mark route scope as
  one-machine/local until a second machine is installed.
- Show degraded/offline states when token, storage, or heartbeat is missing.

Evidence to add:

- `musu.pro` authenticated presence query for this device.
- local Desktop status showing the same device id and owner scope.
- command output or JSON artifact proving login and heartbeat are current.

### Phase 3 - Remote Work-Order Pickup

Make MUSU.PRO input reach this local Desktop without moving execution to the
web server.

- Use the existing room/work-order API boundary as the control-plane input.
- Require owner-scoped auth, target device, permission envelope, command
  allowlist, and audit event.
- Add a one-machine remote-input smoke that posts a bounded test order through
  MUSU.PRO and waits for local pickup.
- The test order should execute a harmless local diagnostic action first, not a
  broad shell command.

Evidence to add:

- MUSU.PRO work-order id and trace id.
- local Desktop pickup log/audit event.
- local execution result.
- MUSU.PRO result/status query returning the same trace id.

### Phase 4 - Result Timeline and AG UI

Turn the backend proof into user-visible product behavior.

- Command Center first screen after login.
- Device selector defaults to this local Desktop.
- Execution-locus banner: `Input from MUSU.PRO`, `Executing on <device>`,
  `Route local/control-plane`, `Evidence pending|ok|failed`.
- Timeline events are typed: order created, delivered, picked up, policy
  checked, executing, result returned, evidence attached.
- `Waiting for device`, `offline`, `not logged in`, `policy blocked`, and
  `evidence missing` are first-class states.

### Phase 5 - One-Machine Release Gate

Add a dedicated one-machine MUSU.PRO functional gate before returning to
two-machine work.

Suggested verifier name:

`scripts/windows/smoke-one-machine-musu-pro-work-order.ps1`

Required output schema:

`musu.one_machine_musu_pro_work_order.v1`

Required checks:

- packaged Desktop is running;
- actual local bridge URL is discovered;
- account/device registration is current;
- MUSU.PRO work-order creation succeeds;
- local pickup occurs on this device;
- command allowlist/audit passes;
- result returns to MUSU.PRO;
- post-run 60s idle CPU evidence remains under budget or links to a fresh
  existing current-head CPU sample;
- no `localhost:3001` assumption is used.

## Two-Machine Entry Criteria

Do not restart two-machine testing until the one-machine gate above passes.

After that, install the same current build on the second Windows PC and run:

- second-PC MSIX install evidence;
- second-PC single-machine smoke;
- second-PC desktop-open idle CPU;
- second-PC runtime CPU scenario matrix;
- route preflight from primary to second PC;
- real multi-device route evidence;
- P2P path-selection evidence with route kind `lan`, `tailscale`,
  `direct_quic`, or `relay`.

The relay byte-path gate is still separate. Release relay markers must remain
false until a real `quic_relay_tunnel` byte path, transport proof, and payload
delivery proof exist.

## Qualitative Assessment

Current one-machine local Desktop quality is good enough to keep building on:
CPU is quiet on the primary machine, process ownership/single-instance evidence
is present, and the source-level busy-loop contracts are covered.

The product risk is communication and E2E remote-control proof. Users should
not be sent to a stale local dashboard port and should not have to know which
localhost port the packaged bridge chose. The next evidence must prove the
actual product promise: MUSU.PRO can accept an order while the installed local
Desktop does the work and reports back.

Public release remains No-Go until the one-machine MUSU.PRO flow, second-PC
runtime/multi-device evidence, live P2P/relay proof, support mailbox proof, and
Store evidence are all present.
