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
2. Finish `musu.pro` owner-scoped P2P control-plane proof: release-grade lease
   storage, wired connect endpoint, wired payload endpoint, and
   `relay_default_data_path=false`.
3. Add room-level web input UX for work orders, AI worker presence, task
   status, and meeting/decision records.
4. Import second-PC return evidence once the current build is installed there:
   MSIX install, desktop-open CPU, CPU matrix, multi-device route explain, and
   execution evidence.

## Release State

Public release remains No-Go. Current local artifacts and one-machine evidence
are usable, but release still needs second-PC runtime/multi-device evidence,
hosted owner-scoped `musu.pro` P2P relay proof, support mailbox evidence, and
Store evidence.
