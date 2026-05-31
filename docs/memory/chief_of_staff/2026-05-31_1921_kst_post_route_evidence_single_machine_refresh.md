# CoS Memory - Post Route-Evidence Single-Machine Refresh

Date: 2026-05-31 19:21 KST

Context:

- Route-evidence gate hardening changed Rust and release PowerShell code, so the
  older single-machine evidence became stale for current HEAD.
- First rerun failed because the dashboard dev server was not reachable. After
  starting Next on `127.0.0.1:3000`, `musu up --json` reported dashboard
  `status=ok`.

Result:

- Single-machine smoke passed on source commit
  `5211ff2ba6d095e474780997ebec10b2327358f4`.
- Recorded evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260531-192015-HUGH_SECOND.evidence.json`
- Dashboard output: `MUSU_RELEASE_SMOKE_OK`
- CLI route output: `MUSU_CLI_ROUTE_OK`
- Dashboard task: `986733bf-c10c-4434-bd8e-d9b0512ce193`
- Bridge URL: `http://127.0.0.1:9818`

Durable caveat:

- This refresh proves the local single-machine beta path after the route-evidence
  gate hardening. It does not close runtime idle CPU, multi-device route,
  support mailbox, or Store certification gates.
