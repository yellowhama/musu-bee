# 2026-06-02 00:55 KST - desktop single-instance release gate

MUSU 1.15.0-rc.1 now has a packaged desktop repeated-activation release gate. `scripts\windows\audit-musu-desktop-single-instance.ps1` writes `musu.desktop_single_instance_audit.v1` by launching the installed MSIX app through `shell:AppsFolder\<AppUserModelId>` and checking that repeated activation leaves at most one `musu-desktop.exe` shell.

Current installed package on `HUGH_SECOND` still fails: AppUserModelId `Yellowhama.MUSU_ygcjq669as2b6!MUSU`, repeat count `3`, before `1`, after `4`, new shells `3`, evidence `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json`, `ok=false`. The script cleaned extra shells afterward.

`write-release-go-no-go.ps1` now reports `desktop_single_instance_verified=false` and adds blocker `desktop-single-instance`; final handoff status and final operator packet verification include the new audit command and evidence root. Source already has the Tauri single-instance plugin from commit `0ed3673a`, but the installed MSIX must be rebuilt/reinstalled and re-audited before desktop release evidence can pass.

Public website deployment is already handled: commit `0ed3673a` deployed to `musu.pro` through Vercel run `26764307713`, with Tests `26764309477`, E2E `26764310368`, and production Playwright QA passing for scroll, favicon-mark logo, and `#24C8DB` accent.
