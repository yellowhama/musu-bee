# MUSU 1.15.0-rc.1 Chat SSE Retry Cap Hardening - 2026-06-04

## Scope

This records the 2026-06-04 roadmap update and closes one frontend idle-loop
candidate in the chat task event stream.

Product direction:

- local MUSU programs are the executors on each device
- `musu.pro` is the web input, project-room, rendezvous, path-selection,
  relay-fallback coordination, and evidence plane
- web-originated work is a control envelope: input, acceptance, status, route
  offer, relay request, and audit record
- after web-assisted rendezvous, the preferred data path is direct P2P mesh
- relay remains fallback and must be backed by owner-scoped transport and
  delivery proof before public P2P claims are allowed
- `localhost` dashboards are local operator/dev surfaces and only work when the
  local runtime/dashboard is running
- real multi-device proof still requires the current MUSU build installed on a
  second Windows PC; the current pass is one-machine hardening

## Root Cause

The chat task SSE path already had capped exponential reconnect delay:

- initial delay `1s`
- multiplier `2`
- maximum delay `10s`
- stale reconnect generation guard
- timer cleanup

It did not have a retry-count cap. If the local bridge SSE endpoint stayed
unavailable, the browser could keep reconnecting forever every `10s`. The
frontend polling audit also checked the delay/timer/generation contract but did
not require a retry cap for this chat stream.

## Change

Updated `musu-bee/src/lib/useChat.ts`:

- added `SSE_MAX_RETRIES = 5`
- added `reconnectAttempts`
- added `resetReconnectState()`
- successful `EventSource` open resets delay and attempts
- lifecycle cleanup, non-agent channels, and active-node changes reset the
  reconnect state
- failed streams stop reconnecting after the retry cap

Updated release coverage:

- `musu-bee/src/app/runtime-polling-contract.test.ts` now asserts the chat SSE
  retry cap, guard, reconnect counter, and reset helper
- `scripts/windows/audit-frontend-polling-contract.ps1` now release-gates the
  chat SSE retry cap and reset contract

## Validation

Passed:

- `npm run test:runtime-polling` - `14/14`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-frontend-polling-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `direct_interval_hit_count=0`
  - `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Code/contract commit:

- `e92e0e558d2336237b7eca70d59c8ce35f764229`

## Release State

Clean go/no-go after the code commit reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines `0/2`
- runtime CPU scenario matrix valid machines `0/2`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`
- blocker count `7`
- blocker areas:
  `single-machine`, `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `support-mailbox`, `store-release`,
  `p2p-control-plane`

The drop from the previous one-machine evidence is expected: frontend runtime
source changed after the latest packaged primary evidence. Current-source
public release claims require a fresh MSIX rebuild/install, single-machine
smoke, desktop-open CPU sample, and five-state runtime CPU matrix.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.
