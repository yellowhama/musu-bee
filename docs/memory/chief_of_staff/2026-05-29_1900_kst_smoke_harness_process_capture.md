# CoS Memory - Smoke Harness Process Capture and Current Evidence

Date: 2026-05-29 19:00 KST

Durable facts:

- After adding the second-PC return-card helper, the previous single-machine evidence became stale for the new script commit.
- During the refresh, the operator noticed many Node processes. Process audit showed only Codex plus the intentionally running Next dev server Node processes; the real stale-process issue was duplicated `musu.exe bridge` instances from failed harness attempts.
- `smoke-single-machine-beta.ps1` exposed two Windows harness issues: `Start-Job` can stay attached to a bridge process spawned by `musu up`, and redirected stdout pipes can remain open when a child bridge inherits handles.
- The single-machine smoke harness now uses readiness retries and `Start-Process` with temp-file stdout/stderr capture instead of PowerShell job/pipe capture.
- Current evidence is `docs\evidence\single-machine\1.15.0-rc.1\20260529-185958-HUGH_SECOND.evidence.json` on commit `242d75f74e98d9cabac6152149de4021433d7a09`.
- Smoke outputs: dashboard `MUSU_RELEASE_SMOKE_OK_20260529_185935`, CLI route `MUSU_CLI_ROUTE_OK_20260529_185935`, task `3cab5be8-1abf-40c0-91ad-3f5d2da33bcb`, bridge `http://127.0.0.1:9218`.
- Public release remains No-Go until clean/current second-PC MSIX install evidence, real second-PC multi-device evidence, `musu@musu.pro` inbox evidence, and Partner Center/Microsoft Store evidence are recorded.
