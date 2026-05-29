# 2026-05-29 13:52 KST - Operator Card Single-Machine Refresh

After adding the packet-aware operator handoff card, current HEAD `159786438d503ac82a48ca150d97453f67ddc4bf` needed fresh single-machine evidence because release scripts changed.

- Local smoke passed with `DashboardBaseUrl http://127.0.0.1:3001`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1352`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1352`.
- Dashboard task id: `c43a853b-1dff-4017-9755-235fca427b5d`.
- Bridge URL: `http://127.0.0.1:4652`.
- Recorded evidence: `docs/evidence/single-machine/1.15.0-rc.1/20260529-135225-HUGH_SECOND.evidence.json`.
- Verification: `docs/evidence/single-machine/1.15.0-rc.1/20260529-135225-HUGH_SECOND.verification.json`.

Final operator packet must be regenerated after this documentation/evidence commit so the packet source metadata points at the final clean HEAD.
