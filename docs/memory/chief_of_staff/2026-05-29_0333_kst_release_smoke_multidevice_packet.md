# CoS Memory — 1.15.0-rc.1 smoke scripts and multi-device packet

Date: 2026-05-29 03:33 KST

Durable decisions:

- `1.15.0-rc.1` remains single-machine Windows beta ready, not full multi-machine release ready.
- Live repeatable script smoke passed with `scripts\windows\smoke-single-machine-beta.ps1`.
- The second-PC test packet now lives in `scripts\windows\smoke-multidevice-beta.ps1` and `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519).
- Release-grade desktop wording must stay precise: Rust runtime/dashboard path is credible beta infrastructure; the Tauri shell is still a dev scaffold and Store certification is pending.
- MSIX workflow script fixed a configuration boundary: `run-msix-workflow.ps1` passes `-Configuration` through to `verify-msix-package.ps1`, and `verify-msix-package.ps1` uses that configuration to select `musu-startup.exe`.
- Current-version MSIX artifacts were regenerated and verified for `1.15.0.0`; Store submission bundle is `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`.

Live evidence:

- dashboard: `http://127.0.0.1:3000`
- bridge: `http://127.0.0.1:11041`
- dashboard task id: `2d9e93b1-fb2f-4cd4-ab40-1147fea89a6d`
- dashboard output: `MUSU_SCRIPT_SMOKE_OK`
- CLI route output: `MUSU_SCRIPT_CLI_OK`
- local-sideload MSIX: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Store-reviewed MSIX: `.local-build\msix\output\musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`

Open gates:

- Run the multi-device packet on the user's second Windows machine.
- Regenerate and verify current-version `1.15.0-rc.1` Store-reviewed MSIX.
- Align/test the Tauri desktop shell before claiming Store-grade GUI readiness.
