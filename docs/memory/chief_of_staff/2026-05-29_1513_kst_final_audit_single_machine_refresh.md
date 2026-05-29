# CoS Memory Note - Final Audit Single-Machine Refresh

**Date**: 2026-05-29 15:13 KST
**Scope**: fresh single-machine evidence after wiki/521 final audit/packet-script commit.

Durable memory:

- After commit `5209a82792b0eb5f439242220fb14495de7c61ac`, the final packet generator/verifier included `wiki/521` and a new packet verified with `ok=true`, `fail_count=0`, `kit_count=1`.
- That script commit made the prior single-machine evidence stale for go/no-go, so `smoke-single-machine-beta.ps1` was rerun with dashboard at `http://127.0.0.1:3000` and bridge at `http://127.0.0.1:4652`.
- Fresh recorded evidence: `docs/evidence/single-machine/1.15.0-rc.1/20260529-151324-HUGH_SECOND.evidence.json`.
- Smoke result: dashboard task `d1571cf6-fbf6-415b-adf5-1e88ca6a3266`, output `MUSU_RELEASE_SMOKE_OK_20260529_1524`, CLI route `MUSU_CLI_ROUTE_OK_20260529_1524`, source commit `5209a82792b0eb5f439242220fb14495de7c61ac`.
- The local `musu up` dashboard probe requires `/app` to finish compiling before it reports `dashboard.status=ok`; a stale dev server caused one `/api/doctor` 500, then a fresh dev server and `/app` compile cleared the probe.

