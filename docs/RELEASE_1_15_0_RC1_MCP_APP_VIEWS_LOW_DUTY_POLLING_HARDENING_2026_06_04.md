# MUSU 1.15.0-rc.1 MCP App Views Low-Duty Polling Hardening

Date: 2026-06-04 21:12 KST

## Summary

The MCP app views under `musu-bee\views` no longer own direct `setInterval`
polling loops.

This closes a frontend idle/busy-loop audit gap: the existing frontend polling
contract covered the Next app source under `musu-bee\src`, but the separate
Vite single-file MCP views still had direct interval polling in:

- `musu-bee\views\nodes\NodesView.tsx`
- `musu-bee\views\tasks\TasksView.tsx`

Both now use `musu-bee\views\shared\useLowDutyPolling.ts`, which mirrors the
release contract already used by the Next app surfaces:

- one-shot timers instead of `setInterval`
- visible-tab gating with hidden-tab backoff
- 5s minimum interval clamp
- 10s default task timeout
- no overlapping poll tasks
- cleanup abort through `AbortController`

## Validation

- `npm run test:runtime-polling` passed `16/16`.
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- `npm run build` in `musu-bee\views` passed for both `tasks` and `nodes`.
- `npx tsc --noEmit` in `musu-bee\views` passed.
- `git diff --check` passed with only existing CRLF normalization warnings for
  the edited view files.

## Release Note

This removes another frontend interval/refetch-loop candidate from the idle CPU
investigation. It also broadens the audit so future direct interval polling in
either `musu-bee\src` or `musu-bee\views` fails the release contract.

This is runtime frontend source. Fresh packaged MSIX/single-machine/CPU/matrix
evidence and regenerated operator packets are required after committing this
change before current source can again claim packaged primary evidence.

Public release remains No-Go on actual second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof,
support mailbox evidence, and Store evidence.
