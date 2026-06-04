# Chief of Staff Memory: Frontend Polling / Local Runtime Evidence Refresh

Date: 2026-06-05

## Debug Report

- Symptom: `ERR_CONNECTION_REFUSED` at `localhost:3001/app` kept making the
  packaged MUSU app look like a failed web app.
- Root cause: `localhost:3001` is an optional workspace/developer dashboard.
  The installed local executor is the WindowsApps `musu.exe` bridge plus
  desktop shell, and bridge-only packaged evidence is valid when
  `dashboard.required=false`.
- Fix/progress: frontend low-duty polling now has full call-site inventory and
  abort-signal coverage; current packaged MSIX, single-machine smoke,
  desktop-open idle CPU, and five-state runtime CPU matrix evidence were
  refreshed without depending on `localhost:3001`.
- Evidence: strict MSIX `20260605-070256-HUGH_SECOND`, single-machine
  `20260605-065900-HUGH_SECOND`, idle CPU
  `20260605-070404-HUGH_SECOND.desktop-open`, and runtime matrix
  `20260605-070552-HUGH_SECOND`.
- Status: DONE_WITH_CONCERNS. One-machine local runtime evidence is current and
  the localhost confusion is documented, but public release remains No-Go until
  second-PC, hosted P2P, support mailbox, and Store evidence are complete.

## Validation

- Frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`, signal gaps `0`, direct intervals `0`,
  direct visibility listeners `0`.
- `npm run test:runtime-polling`: `17/17`.
- `npm run typecheck`: passed.
- Desktop-open idle CPU: `60.046s`, MUSU `0`, Node `0`, WebView2 `0.26`,
  working set `364.9MB`, hot `0`.
- Runtime matrix: `ok=true`, verifier `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_070552`, max WebView2 CPU `0.21`, max
  working set `365.61MB`, hot `0`.

## Remaining Gates

- Final handoff status: `ready_for_public_desktop_release=false`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime matrix `1/2`,
  `multi_device_verified=false`, and `p2p_control_plane_verified=false`.
- Second PC still needs this current build installed before multi-device and
  two-machine runtime gates can close.
- Hosted P2P still needs production KV/Upstash config, release relay tunnel
  proof, owner-scoped route evidence, and relay payload delivery proof.
