# MUSU 1.15.0-rc.1 Bounded Frontend SSE Hardening

Date: 2026-06-03 16:51 KST
Wiki: wiki/626
GOAL: v436

## Scope

The dashboard had several raw `EventSource` subscriptions that relied on the
browser's built-in reconnect loop. That is correct for happy-path delivery, but
it is a weak release posture when the bridge or task stream is unavailable:
failed streams can continue reconnecting in background tabs and look like a
frontend busy-loop candidate during CPU attribution.

This change adds a shared bounded SSE hook and applies it to dashboard surfaces
that subscribe at mount time:

- `musu-bee/src/lib/useBoundedEventSource.ts`
- `musu-bee/src/app/fleet/page.tsx`
- `musu-bee/src/app/c/[id]/page.tsx`
- `musu-bee/src/app/m/[id]/page.tsx`
- `musu-bee/src/components/TasksPanel.tsx`
- `musu-bee/src/app/runtime-polling-contract.test.ts`

## Behavior

`useBoundedEventSource` now:

- opens a single `EventSource(url)` per enabled subscription
- closes failed streams before scheduling a retry
- uses capped exponential reconnect timing: `1s`, doubled up to `10s`
- stops after `5` failed reconnect attempts
- closes streams and clears retry timers while the document is hidden
- reconnects from a clean generation when the document becomes visible again
- keeps handlers in refs so callers do not reconnect just because callback
  identities changed

The fleet, company, machine, and task panel pages still keep their existing
low-duty polling fallback. The fallback is now the safety net instead of an
unbounded browser SSE retry loop.

## Validation

Passed:

- `npm run test:runtime-polling` (`14/14`)
- `npm run typecheck`
- `npm run build`
- `git diff --check`

`git diff --check` only reported the existing CRLF normalization warning for
`musu-bee/src/components/TasksPanel.tsx`.

Release go/no-go summary from 2026-06-03 16:51 KST:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `p2p_control_plane_verified=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_payload_transport_proven=false`
- `git_dirty=true`
- manifest commit: `c0014143cb98ceee6872c58038f89633a4d8586a`

## Release Interpretation

This closes another frontend busy-loop candidate by preventing dashboard
mount-time SSE subscriptions from relying on unbounded browser auto-retry.

This is runtime source, so the previous clean packaged primary evidence from
`20260603-160842-HUGH_SECOND`, `20260603-161155-HUGH_SECOND.desktop-open`, and
`20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix` remains useful history
but must be refreshed after this source change is committed and a fresh MSIX is
built/installed before current-HEAD packaged evidence can be claimed.

Public release remains No-Go on second-PC runtime/multi-device evidence, hosted
P2P relay payload proof, support mailbox evidence, Store evidence, and the
current dirty git state until this change is committed.
