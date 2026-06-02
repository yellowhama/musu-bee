# 2026-06-03 Fleet SSE Lifecycle Hardening

MUSU 1.15.0-rc.1 added explicit lifecycle ownership for the global Fleet
EventSource in `musu-bee/src/store/useFleetStore.ts`.

Durable facts:

- commit: `aa23fc85c7caba0e05e3436df3aa3c64e3acfa39`
- `useFleetStore` now caps Fleet SSE reconnect attempts at `5`
- reconnect starts at `1_000ms`, doubles by `2`, and caps at `10_000ms`
- `fleetReconnectGeneration` rejects stale reconnect timers
- `closeSSE()` clears reconnect timers, closes the global EventSource, and
  resets retry state
- `/dashboard/fleet` and `/dashboard/agent/[id]` now call `closeSSE()` on
  unmount
- runtime-polling contract coverage increased to `12/12`
- validation passed `npm run test:runtime-polling`, `npm run typecheck`,
  `npm run build`, and `git diff --check`

Release interpretation:

- this closes one frontend busy-loop hardening gap
- it does not prove the user's reported 20% CPU issue is fully fixed
- because frontend runtime source changed, previous primary MSIX smoke/CPU
  evidence is stale for current HEAD
- clean go/no-go after the code commit reports
  `ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
  `single_machine_verified=false`, `multi_device_verified=false`,
  `public_metadata_ok=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, and `manifest_git.dirty=false`

Next required work:

- rebuild/install MSIX for `aa23fc85`
- refresh primary single-machine smoke, desktop-open CPU, and runtime CPU matrix
- restore `single_machine_verified=true`
- continue external gates: second-PC, `musu.pro` KV/Upstash owner-scope P2P,
  relay payload transport, `musu@musu.pro`, and Store evidence

Canonical report:

- `docs/RELEASE_1_15_0_RC1_FLEET_SSE_LIFECYCLE_HARDENING_2026_06_03.md`
