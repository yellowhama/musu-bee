# CoS Memory - Operator Action Pack Single-Machine Refresh

Date: 2026-05-30 05:40 KST

Durable facts:

- After committing operator action pack release infra at `2b91d0a78180eec19285948824a1f455ff48e39d`, single-machine smoke was rerun and recorded.
- Current evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260530-053645-HUGH_SECOND.evidence.json`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260530_053611`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260530_053611`.
- Dashboard task: `d0f7f581-3c3e-49b2-a551-1f8881100aa8`.
- Bridge: `http://127.0.0.1:11971`.
- Verification passed with `-AllowDocumentationOnlyGitDelta`; `doctor_overall=warn` remains acceptable because the smoke uses the cargo smoke binary rather than the installed WindowsApps/MSIX alias.
- A first smoke attempt failed while the Next dev server was still compiling `/app`; after compilation, `musu up --json` reported bridge/dashboard `ok` and the rerun passed.
- This refresh keeps only the single-machine local beta gate current. The public desktop release gates remain open for second-PC MSIX install evidence, real multi-device evidence, `musu@musu.pro` delivery evidence, and Partner Center/Microsoft Store approval evidence.
