# MUSU 1.15.0-rc.1 Local Program / Web Input Roadmap Alignment

**Wiki ID**: wiki/690
**Date**: 2026-06-04 KST

## Decision

The roadmap is locked to a split product model:

- Local MUSU programs and the `musu.pro` website are separate surfaces.
- Local MUSU programs do the work on each device: files, shell/app/browser
  automation, local bridge/runtime execution, and P2P mesh traffic.
- `musu.pro` is the user input, project room, company meeting room, presence,
  rendezvous, path-selection, fallback-relay coordination, and evidence plane.
- `musu.pro` receives user work orders and room activity, then sends
  authenticated bounded envelopes to the right local program.
- `musu.pro` room, presence, rendezvous, route-candidate, and relay-control
  records must be scoped to the authenticated P2P control owner.
- `musu.pro` does not replace local execution and must not become the default
  data path.
- Devices use `musu.pro` to find each other and exchange signed route offers,
  then prefer direct P2P mesh once a viable route exists.
- Hosted relay is fallback after direct path failure and should remain the
  Connect/Pro boundary.

This resolves the localhost confusion: `http://127.0.0.1:3001/app` is a
local-only dashboard URL that works only while the installed local runtime is
running on the same machine. The product entrypoint for entering work from
another place should be `https://musu.pro`.

## Room Model

`musu.pro` company/project rooms should act like shared meeting rooms for AI
workers attached to the same project:

- user work orders,
- worker presence and capabilities,
- task acceptance/status/result events,
- decisions and handoffs,
- route/session status,
- audit/evidence records, and
- fallback relay lease requests after direct routes fail.

The room coordinates the work, but the local device still executes the work.
Room state must remain owner-scoped so another valid bearer cannot read or
mutate a different owner/company/project's rendezvous state or route
candidates.

## 2026-06-05 Owner-Scope Update

Rendezvous source now matches the roadmap boundary:

- rendezvous sessions store `owner_key`,
- read/update/approve/close/candidate routes require a matching owner,
- room rendezvous uses the authenticated owner for session creation,
- room presence seeds route candidates only into the same owner's cache, and
- the operator API security audit fails if this owner-scope contract is
  removed.

This closes a local web-control-plane hardening gap. It does not yet close the
hosted P2P release gate because live MUSU.PRO still needs configured
KV/Upstash storage, wired connect/payload endpoints, release-grade transport
proof, and payload delivery proof.

## Current Validation Boundary

Current release validation is one-machine on `HUGH_SECOND` unless the current
build is installed on another Windows PC. One-machine work can continue for
packaged startup, local smoke, idle CPU, CPU scenario matrix, background-loop
contracts, route explain diagnostics, and fail-closed hosted P2P evidence
gates.

Successful multi-device route proof, second-PC idle CPU, second-PC CPU matrix,
and true P2P mesh evidence cannot close until the current package is installed
and run on the second PC.

## Next Work

1. Keep current one-machine packaged evidence fresh and do not let docs/test
   changes stale runtime gates.
2. Finish `musu.pro` owner-scoped P2P control-plane proof: live hosted storage,
   release-grade lease storage, wired connect endpoint, wired payload endpoint,
   payload delivery proof, and `relay_default_data_path=false`.
3. Add room-level web input UX for work orders, AI worker presence, task
   status, and meeting/decision records.
4. Import second-PC return evidence once the current build is installed there:
   MSIX install, desktop-open CPU, CPU matrix, multi-device route explain, and
   execution evidence.

## Release Gate Alignment

As of 2026-06-04 22:40 KST, the release gate surface is aligned with this
product split. Final go/no-go and final handoff status now expose the hardening
gates needed before web-input control is trusted:

- frontend polling contract,
- Rust background-loop contract,
- local API auth contract,
- operator API security contract,
- process ownership,
- startup single-instance, and
- packaged desktop single-instance.

This keeps `musu.pro` as a remote input/coordination plane while requiring the
local bridge and web-driven control routes to remain authenticated,
allowlisted, audit-logged, and resource-bounded.

## Release State

Public release remains No-Go. Current local artifacts and one-machine evidence
are usable, but release still needs second-PC runtime/multi-device evidence,
hosted owner-scoped `musu.pro` P2P relay proof, support mailbox evidence, and
Store evidence.

## 2026-06-06 Desktop Clean-Start Evidence Update

The latest local packaged validation confirms the split again:

- MUSU Desktop is the installed local executor.
- `localhost:3001` is optional local/developer dashboard surface, not the
  packaged runtime success criterion.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence/control
  plane.

Current HUGH_SECOND evidence:

- strict MSIX install: `20260606-171011-HUGH_SECOND`
- single-machine smoke: `20260606-170759-HUGH_SECOND`, `local-bridge-only`
- desktop-open CPU: `20260606-171154-HUGH_SECOND.desktop-open`, WebView2 max
  `0.23`, hot `0`
- runtime CPU matrix: `20260606-171403-HUGH_SECOND`, verifier `ok=true`,
  `fail_count=0`

The remaining release work is not to make MUSU.PRO execute local work. It is to
install the current desktop on another Windows PC, prove real P2P/multi-device
execution, and make hosted MUSU.PRO release relay proof pass.

## 2026-06-07 One-Machine MUSU.PRO Functional Roadmap

The next operator milestone is narrowed back to one Windows machine before
resuming second-PC work. The canonical plan is
`docs\RELEASE_1_15_0_RC1_ONE_MACHINE_MUSU_PRO_CONNECTION_FUNCTIONAL_ROADMAP_2026_06_07.md`.

Current status:

- local artifacts are ready;
- single-machine packaged Desktop evidence passes;
- desktop-open idle CPU and full runtime CPU matrix each pass on one machine;
- busy-loop source contracts pass;
- public MUSU.PRO privacy/support metadata passes;
- public release remains No-Go because two-machine, live P2P/relay, support
  mailbox, and Store evidence are still missing.

One-machine completion now means:

1. packaged MUSU Desktop starts and discovers its actual local bridge URL;
2. MUSU Desktop is logged in or otherwise owner-scoped to MUSU.PRO;
3. MUSU.PRO shows this device as an online local executor;
4. a MUSU.PRO work order targets this device;
5. this local Desktop picks up and executes the bounded work order;
6. MUSU.PRO receives status/result/evidence without implying cloud execution;
7. post-run idle CPU stays under budget and process roles remain attributable.

Second-PC testing should start only after that one-machine remote-input path is
proven on the current build.
