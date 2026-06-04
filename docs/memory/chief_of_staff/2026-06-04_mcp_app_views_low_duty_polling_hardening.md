# 2026-06-04 MCP App Views Low-Duty Polling Hardening

- Removed direct `setInterval` polling from `musu-bee\views\nodes\NodesView.tsx`
  and `musu-bee\views\tasks\TasksView.tsx`.
- Added `musu-bee\views\shared\useLowDutyPolling.ts` for the Vite single-file
  MCP app views.
- Expanded `audit-frontend-polling-contract.ps1` so it scans both
  `musu-bee\src` and `musu-bee\views`; the audit now records direct interval
  and direct visibility listener hits across both frontend surfaces.
- Added runtime-polling contract coverage for the MCP app views.
- Validation passed:
  - `npm run test:runtime-polling` `16/16`
  - `audit-frontend-polling-contract.ps1 -Json` with `ok=true`,
    `fail_count=0`, `direct_interval_hit_count=0`,
    `direct_visibility_listener_hit_count=0`
  - `npm run build` in `musu-bee\views`
  - `npx tsc --noEmit` in `musu-bee\views`
  - `git diff --check`
- This is runtime frontend source, so current packaged evidence and operator
  packets become stale after commit until rebuilt/refreshed.
