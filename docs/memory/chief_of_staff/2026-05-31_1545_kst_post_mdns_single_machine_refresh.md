# 2026-05-31 15:45 KST - Post-mDNS Single-Machine Refresh

## Durable Evidence

- After committing mDNS opt-in hardening, single-machine smoke passed from source commit `dbd90e31c58d56f58d7d93dddeae9a74a4c16234`.
- Evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260531-154114-HUGH_SECOND.evidence.json`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260531_1540`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260531_1540`.
- Dashboard task: `9e00f24e-1bbc-4cbf-b6aa-7057fdfeb63c`.
- Bridge: `http://127.0.0.1:1407`.

## Release State

- `single_machine_verified=true` should remain true for doc/evidence-only follow-up commits.
- Public desktop release still waits on real second-PC MSIX install, real multi-device route, `musu@musu.pro` inbox delivery, and Partner Center/Microsoft Store approval evidence.
