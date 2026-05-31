# 2026-05-31 20:24 KST - Post Process Ownership Single-Machine Refresh

Durable memory:

- After commit `9223404693bdc81731981130fdd40093321fe49e` added the process ownership release gate, go/no-go correctly reported `process_ownership_verified=true` but the previous single-machine smoke evidence was stale for the new source commit.
- Next dev server was started on `127.0.0.1:3000` only long enough to rerun `scripts\windows\smoke-single-machine-beta.ps1`; the added Node processes were stopped afterward.
- New single-machine evidence was recorded under `docs\evidence\single-machine\1.15.0-rc.1\20260531-202354-HUGH_SECOND.evidence.json`.
- Dashboard task: `89e6ab33-24de-4326-97f2-ebc2f6588209`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK`.
- CLI route output: `MUSU_CLI_ROUTE_OK`.
- Bridge: `http://127.0.0.1:9818`.
- This keeps `single_machine_verified=true` after the process ownership gate commit; remaining public-release blockers are two-machine runtime idle CPU evidence, real multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence.
