# 2026-05-29 13:38 KST - Support Email and Single-Machine Refresh

After correcting the release support mailbox to `musu@musu.pro`, current HEAD `ac98f6c2cc159b5665dfcfeb3d9bc4db26631966` needed fresh single-machine evidence because app/script code changed.

- Local smoke passed with `DashboardBaseUrl http://127.0.0.1:3001`.
- Initial `http://127.0.0.1:3000` smoke attempt failed because that port was no longer the active dashboard API; `musu doctor --json` reported reachable dashboard `http://127.0.0.1:3001/app`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1338`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1338`.
- Dashboard task id: `c52d5d28-4eb2-43c2-8bbc-aeeaac5428b5`.
- Bridge URL: `http://127.0.0.1:4652`.
- Recorded evidence: `docs/evidence/single-machine/1.15.0-rc.1/20260529-133756-HUGH_SECOND.evidence.json`.
- Verification: `docs/evidence/single-machine/1.15.0-rc.1/20260529-133756-HUGH_SECOND.verification.json`.

Public metadata on live `https://musu.pro/privacy` and `/support` now verifies with expected support email `musu@musu.pro`; the old `support@musu.pro` string is absent from those live pages.
