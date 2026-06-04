# 2026-06-04 MCP App View Abort-Signal Hardening

Locked direction:

- `musu.pro` remains the remote input, project room, company meeting room,
  presence, rendezvous, path-selection, relay-fallback coordination, and
  evidence plane.
- Local MUSU programs execute the work and prefer P2P mesh after web-assisted
  rendezvous.
- Current validation remains one-machine until the same current build is
  installed on a second Windows PC.

Work completed:

- Found a remaining MCP app view polling audit gap: the low-duty poller created
  an `AbortSignal`, but `NodesView` and `TasksView` did not pass it into
  `app.callServerTool`.
- Updated the MCP app views to pass the signal and ignore stale results after
  abort.
- Updated the unused shared view task API helpers to accept/pass optional abort
  signals so future direct bridge fetches keep the same contract.
- Expanded `audit-frontend-polling-contract.ps1` and runtime polling tests to
  require the MCP view abort-signal propagation.

Validation:

- `npm run test:runtime-polling` passed `16/16`.
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`.
- `npx tsc --noEmit` and `npm run build` passed in `musu-bee\views`.
- Rebuilt and installed local-sideload MSIX.
- Single-machine smoke passed at
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-214647-HUGH_SECOND.evidence.json`.
- Desktop-open CPU passed at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-214900-HUGH_SECOND.desktop-open.evidence.json`.
- Five-state runtime CPU matrix passed at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-215050-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.

Current status:

- Primary-machine packaged evidence is restored for current source.
- Public release remains blocked by second-PC multi-device evidence, two-machine
  CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof, support
  mailbox evidence, and Store evidence.

