# 2026-06-05 Packaged Dev Dashboard Opt-In Gate

Symptom:

- User repeatedly hit `ERR_CONNECTION_REFUSED` at `localhost` / `127.0.0.1:3001`.
- The concern was that MUSU was supposed to be a local program, not a web server dependency.

Root cause:

- `127.0.0.1:3001` is the optional developer Next.js dashboard.
- The packaged MUSU local runtime works through its local bridge and does not require that dashboard.
- Existing desktop shell code still treated a live dev dashboard as an openable local dashboard surface, which kept the local/web boundary confusing.

Fix:

- Packaged Tauri desktop now disables the developer dashboard surface unless `MUSU_DESKTOP_ENABLE_DEV_DASHBOARD=1` is set or the build is a debug build.
- Shell copy now says `Debug Dashboard`.
- `verify-single-machine-evidence.ps1` rejects packaged evidence tied to fixed dev dashboard ports `3000` or `3001`.
- `audit-desktop-release-readiness.ps1` gates the packaged dev-dashboard opt-in contract.
- `audit-frontend-polling-contract.ps1` now covers Tauri shell JS for interval/timeout/animation loops.

Evidence:

- Tauri tests: 8 passed.
- Tauri shell build: passed.
- Frontend polling audit: `ok=true`, `fail_count=0`.
- Release verifier regression: `ok=true`, `case_count=41`, `failed_case_count=0`.
- Desktop readiness: new packaged dev-dashboard opt-in check passed; overall No-Go remains due to existing multi-device evidence blocker.

Status: DONE_WITH_CONCERNS

Concern:

- The installed MSIX has not yet been rebuilt from this source change. Fresh packaged evidence is required before this behavior is present in the installed app.
