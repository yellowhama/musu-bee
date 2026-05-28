# CoS Memory Note - Single-Machine Smoke Refresh (2026-05-29 06:55 KST)

Facts:

- Fresh single-machine beta smoke passed on the current `main` commit `f9ae8730d722cb8af771026b2fb84e1a73643482`.
- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1 -DashboardBaseUrl http://127.0.0.1:3000 -ExpectedDashboardOutput MUSU_RELEASE_SMOKE_OK_20260529_0652 -ExpectedCliOutput MUSU_CLI_ROUTE_OK_20260529_0652`
- Bridge URL: `http://127.0.0.1:11041`
- Dashboard task id: `b4b05b93-34d2-4946-b4cd-fdd5c5c6632d`
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0652`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260529_0652`.

Decision:

- The assistant-side single-computer test is current for `1.15.0-rc.1`.
- Public desktop release status remains No-Go only because real second-PC evidence and real `support@musu.pro` delivery evidence are still missing.

Canonical follow-up:

- `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`
