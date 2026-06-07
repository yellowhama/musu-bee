# MUSU 1.15.0-rc.1 One-Machine MUSU.PRO Work-Order Smoke Gate

Date: 2026-06-07 21:34 KST

## Purpose

This report turns the one-machine MUSU.PRO roadmap into an executable
diagnostic gate.

The milestone is not `localhost:3001`. The milestone is:

1. the installed MUSU Desktop is running on this Windows PC;
2. the local runtime discovers its actual bridge URL;
3. this Desktop is authenticated and visible to `https://musu.pro`;
4. a MUSU.PRO work order targets this Desktop;
5. the Desktop picks up the bounded order outbound and executes locally;
6. MUSU.PRO receives result/status/evidence;
7. post-run idle CPU evidence remains under budget.

## Code Added

New smoke script:

`scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`

Output schema:

`musu.one_machine_musu_pro_work_order.v1`

Release verifier source contract:

`scripts\windows\test-release-evidence-verifiers.ps1`

Server-side work-order inbox/claim implementation:

`docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_OUTBOUND_PICKUP_INBOX_2026_06_07.md`

The source contract now requires the smoke to check local runtime readiness,
actual bridge URL discovery, MUSU.PRO room presence publish/list,
owner-scoped work-order POST, `desktop_outbound_pickup`, work-order claim
schema `musu.room_work_order_claim.v1`, no fixed `localhost:3001` assumption,
post-run idle CPU evidence linkage, and strict failure exit behavior unless
`-AllowUnverified` is passed for diagnostics.

## Current Evidence

Diagnostic evidence:

`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-215300-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`

Summary:

- `ok=false`
- `fail_count=12`
- `base_url=https://musu.pro`
- packaged alias: `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu up --json` passed
- `musu doctor --json` was parseable and not failed
- discovered bridge URL: `http://127.0.0.1:9741`
- fixed `localhost:3001` assumption: `false`
- account logged in: `false`
- P2P control token present: `false`
- presence publish/list both returned `not_logged_in`
- work-order POST was skipped because there was no P2P control token
- work-order claim was skipped because there was no P2P control token
- post-run idle CPU evidence was not supplied because no remote pickup ran

This is a valid diagnostic failure, not a release pass.

## API Boundary Finding

The existing room work-order API at
`musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts` is now a usable
control-plane boundary for queued work orders, but it is not yet the full local
Desktop execution path.

The old bridge-forward path still calls `getBridgeUrl()` server-side and
forwards to `/api/tasks/delegate` for local/dev scenarios. Hosted
`https://musu.pro` cannot directly call a user's `127.0.0.1` bridge, so the
new hosted-safe path is explicit `delivery_mode: "desktop_outbound_pickup"`:

- MUSU.PRO stores an owner-scoped work-order envelope in a room/device inbox;
- MUSU Desktop publishes presence and claims/pulls assigned work outbound;
- local policy validates and executes the envelope;
- Desktop posts status/result/evidence back to MUSU.PRO;
- MUSU.PRO displays coordination and proof without claiming cloud execution.

## Roadmap Reset

### Phase 1 - Local Desktop Baseline

Status: mostly done on `HUGH_SECOND`.

- packaged runtime starts through WindowsApps alias;
- bridge is reachable at its discovered runtime URL;
- `localhost:3001` is not required;
- current one-machine CPU/matrix evidence is under budget;
- remaining issue: packaged account login is missing in this environment.

### Phase 2 - MUSU.PRO Login and Presence

Next implementation target.

- make packaged `musu login` or equivalent account linking work cleanly;
- persist account token in the installed runtime profile;
- publish room/device presence to `https://musu.pro`;
- query the same room and prove this Desktop is visible as the local executor;
- expose visible UI state for `not logged in`, `offline`, `heartbeat stale`,
  and `executor ready`.

Exit evidence:

- smoke passes `MUSU.PRO account login`;
- smoke passes `room presence publish`;
- smoke passes `room presence query`.

### Phase 3 - Owner-Scoped Work-Order Ingress

Next after presence.

- configure or mint the owner-scoped P2P control credential;
- keep `/api/rooms/[roomId]/work-orders` owner-scoped;
- add or wire a durable MUSU.PRO work-order inbox;
- return `work_order_id`, `trace_id`, `owner_scoped=true`, room, project,
  target, and permission envelope.

Status: server-side inbox and claim API are implemented. Remaining work is
runtime login/credential, live POST/claim with real token, and local Desktop
claim client.

Exit evidence:

- smoke passes `P2P control token available`;
- smoke passes `MUSU.PRO work-order POST`;
- smoke passes `work-order id echoed`;
- smoke passes `work-order owner scoped`;
- smoke passes `work-order origin`.
- smoke passes `work-order queued for outbound pickup`;
- smoke passes `MUSU.PRO work-order claim`.

### Phase 4 - Desktop Outbound Pickup and Local Execution

This is the missing product path.

- Desktop polls or streams an assigned room/device inbox with bounded backoff;
- pickup uses owner/device identity and a claim token;
- local bridge receives only the claimed, policy-checked envelope;
- first action is a harmless diagnostic command, not broad shell execution;
- result is posted back to MUSU.PRO with trace id and local execution locus.

Exit evidence:

- smoke passes `local bridge task response`;
- MUSU.PRO task timeline shows created, claimed, policy checked, executing,
  completed/failed, and evidence attached;
- UI copy says `Input from MUSU.PRO` and `Executing on HUGH_SECOND`.

### Phase 5 - Post-Run Resource Evidence

Run after successful pickup.

- capture 60s idle CPU after the remote-input run;
- link that JSON through `-PostRunIdleCpuEvidencePath`;
- keep MUSU, Node, WebView2, bridge runtime, and desktop shell roles
  attributable.

Exit evidence:

- smoke passes `post-run idle CPU evidence`;
- latest go/no-go can cite the one-machine work-order run as functional proof.

### Phase 6 - Second Machine

Only after the one-machine gate passes.

- install the same current build on the second Windows PC;
- run MSIX/single-machine/idle CPU/matrix evidence there;
- verify route candidates through MUSU.PRO;
- prove direct-first P2P or explicit relay fallback with route evidence.

## Qualitative Assessment

The local Desktop foundation is usable enough to continue: bridge startup,
doctor readiness, CPU budget, and no-`localhost:3001` behavior are under
control on this machine.

The current product gap is not the local program. The gap is authenticated
MUSU.PRO-to-Desktop work delivery. Until login, owner-scoped token, presence,
work-order inbox/claim, local pickup, result return, and post-run CPU evidence
all pass, the one-machine MUSU.PRO functional path is still not complete.
