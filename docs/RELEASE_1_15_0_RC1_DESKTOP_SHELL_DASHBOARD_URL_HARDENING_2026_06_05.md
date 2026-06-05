# 1.15.0-rc.1 Desktop Shell Dashboard URL Hardening - 2026-06-05

## Summary

The installed packaged MUSU runtime is the local executor. A workspace dashboard
on `127.0.0.1:3001` is optional and may be absent in the packaged local-runtime
state. The desktop shell and `/app` gate now avoid presenting an absent fixed
localhost dashboard as the user path.

## Root Cause

On HUGH_SECOND, the installed MUSU bridge was healthy at `127.0.0.1:10325`, but
no process listened on `127.0.0.1:3001`. Browser navigation to
`http://127.0.0.1:3001/app` therefore returned `ERR_CONNECTION_REFUSED` even
though the local MUSU program was running.

That was a product-surface mismatch, not an internet connectivity failure:

- `127.0.0.1:10325/health` returned `200 OK`.
- `127.0.0.1:3001` had no listener.
- `/status` and `/api/status` on the bridge returned `401`, which is expected
  for authenticated local API surfaces.

## Source Changes

- `musu-bee/src-tauri/src/lib.rs`
  - `probe_dashboard()` now returns `dashboard_url=None` when neither
    `3000` nor `3001` responds.
  - It no longer fabricates `http://127.0.0.1:3000/app` as a fallback URL.
- `musu-bee/src-tauri-shell/main.js`
  - `Open Dashboard` is disabled unless a reachable dashboard URL is reported.
  - Clicking the button without a URL logs an unavailable-dashboard message
    instead of opening a dead localhost URL.
- `musu-bee/src/app/app/page.tsx`
  - The cloud/free gate no longer says `Dashboard is Local-Only`.
  - It no longer instructs users to visit `http://localhost:3001/app`.
  - It now describes the intended split: local MUSU Desktop executes work, and
    MUSU.PRO connects to that local runtime for user input/control-plane work.

## Validation

- `cargo fmt --manifest-path .\musu-bee\src-tauri\Cargo.toml`
- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml`
  - `7/7` unit tests passed.
- `.\node_modules\.bin\tsc.cmd --noEmit`
- `git diff --check`

`pnpm typecheck` did not reach TypeScript because the current pnpm policy
stopped at ignored dependency build scripts requiring `pnpm approve-builds`.
The direct `tsc --noEmit` check passed after dependency materialization.

## Release Implication

This is desktop shell and web app source. Fresh MSIX install, single-machine
smoke, desktop-open idle CPU, and runtime CPU scenario matrix evidence are
required again before current-source local runtime gates can be claimed.

This change does not close second-PC, hosted P2P release proof, support mailbox,
or Store gates.
