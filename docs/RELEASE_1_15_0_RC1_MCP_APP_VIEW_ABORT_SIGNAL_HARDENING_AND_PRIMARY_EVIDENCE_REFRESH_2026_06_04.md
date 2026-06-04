# RELEASE 1.15.0-rc.1 MCP App View Abort-Signal Hardening And Primary Evidence Refresh - 2026-06-04

## Summary

The MCP app views now pass the low-duty poller's `AbortSignal` into the actual
proxied MCP tool requests. This closes the audit gap where the view poller had
a timeout/cancel signal but `NodesView` and `TasksView` did not hand that signal
to `app.callServerTool`.

This keeps the local-executor roadmap intact: `musu.pro` is the remote input,
project room, company meeting room, presence, rendezvous, path-selection,
relay-fallback coordination, and evidence plane. Local MUSU programs execute
the work and prefer P2P mesh after web-assisted rendezvous.

## Changed

- `musu-bee\views\nodes\NodesView.tsx` now passes the poller signal into
  `app.callServerTool({ name: "poll_agents" }, { signal })` and ignores stale
  results after abort.
- `musu-bee\views\tasks\TasksView.tsx` now does the same for `poll_tasks`.
- `musu-bee\views\shared\api.ts` now accepts and forwards optional abort
  signals for task fetch/cancel helpers.
- `scripts\windows\audit-frontend-polling-contract.ps1` now requires MCP app
  view pollers to propagate abort signals into tool calls.
- `musu-bee\src\app\runtime-polling-contract.test.ts` now covers the MCP view
  abort-signal contract.

## Validation

- `npm run test:runtime-polling` passed `16/16`.
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- `npx tsc --noEmit` in `musu-bee\views` passed.
- `npm run build` in `musu-bee\views` passed for tasks and nodes.
- `git diff --check` passed with only existing CRLF normalization warnings.

## Primary Evidence Refresh

The local-sideload MSIX was rebuilt and installed for current source. Install
verification passed, while HUGH_SECOND still has warning-mode PATH shadowing:
`C:\Users\empty\.cargo\bin\musu.exe` appears before the WindowsApps alias.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-214647-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-214900-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-215050-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_214623`
- desktop-open CPU `60.061s`, `git_dirty=false`, MUSU `0`, Node `0.1`,
  WebView2 `0.1`, owned WebView2 `6`, working set `492.61MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_215050`
- matrix max role CPU: MUSU `0`, Node `0.03`, WebView2 `0.26`
- matrix max working set `495.13MB`

## Release Status

Primary-machine packaged evidence is restored for this source. Public desktop
release remains No-Go until:

- real second-PC multi-device evidence is recorded,
- runtime idle CPU and runtime CPU matrix evidence pass on at least two machines,
- live `https://musu.pro` P2P control-plane proof passes,
- `musu@musu.pro` support mailbox delivery is operator-verified, and
- Store/Partner Center evidence is recorded.

