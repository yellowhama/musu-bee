# 2026-06-05 Desktop shell dashboard URL hardening

The user hit `ERR_CONNECTION_REFUSED` at `http://127.0.0.1:3001/app`.

Investigation:

- packaged MUSU was running
- bridge listener was `127.0.0.1:10325`
- `127.0.0.1:10325/health` returned `200 OK`
- no listener existed on `127.0.0.1:3001`

Source hardening:

- Tauri `probe_dashboard()` no longer returns a fabricated dashboard fallback
  URL when `3000` and `3001` are absent.
- Desktop shell disables `Open Dashboard` unless status reports a live
  dashboard URL.
- `/app` gate copy no longer tells users to visit `localhost:3001/app`; it now
  frames MUSU Desktop as the local executor and MUSU.PRO as the remote input /
  control-plane surface.

Validation:

- Tauri shell tests passed `7/7`.
- direct `tsc --noEmit` passed.
- `git diff --check` passed.

Release implication: source changed after current packaged evidence, so fresh
MSIX, single-machine, idle CPU, and runtime CPU matrix evidence is required
before current-source local runtime gates can be claimed again.
