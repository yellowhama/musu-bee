# 2026-06-15 Add PC Join-Key Wiring Audit

Durable memory:

- Current HEAD had a product mismatch: the backend had
  `private_mesh_create_join_key` and `musu mesh create-join-key --json`, but
  the Cockpit Add PC panel still told users to copy
  `scripts/create-join-key.ps1`.
- Fixed the Cockpit Add PC path so `Issue pass` calls
  `invoke("private_mesh_create_join_key")`, renders the generated pass path,
  and exposes only `Copy path`.
- Contract tests now reject the old `scripts\create-join-key.ps1` copy
  affordance in the normal Add PC flow.
- Follow-up wiring audit found `cockpit-browser.spec.ts` was still validating
  the old Add PC contract. Updated it to click `Issue pass`, verify
  `private_mesh_create_join_key`, render/copy the pass path, and reject the old
  helper copy surface.
- Follow-up browser QA now also clicks `Start control host`, verifies
  `private_mesh_start_control_host`, and confirms the success result before
  issuing the device-add pass.
- Follow-up browser QA now also clicks `Generate bundle`, verifies
  `private_mesh_bootstrap`, checks the `serverUrl` argument, and confirms
  bundle result/file rendering before starting the control host.
- Fixed a safety issue in `run_create_join_key`: if the helper does not create a
  new pass file, MUSU now fails instead of falling back to a stale existing
  `device-add-passes/*.json`.
- Mitigated Windows console flicker for helper execution by adding
  `-NoProfile -NonInteractive` and `CREATE_NO_WINDOW` to the helper child
  process.
- IPC inventory initially found `open_dashboard` as the only
  registered-but-not-invoked Tauri command. It is now wired as a diagnostics-only
  `Open dashboard` action that appears only when `desktop_status.dashboard_url`
  exists.
- Post-fix IPC inventory reports `22` registered Tauri commands, `22`
  frontend-invoked commands, `0` invoked-but-not-registered commands, and `0`
  registered-but-not-invoked commands.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_ADD_PC_JOIN_KEY_WIRING_AUDIT_SPEC_2026_06_15.md`

Verification:

- `npm run test:tauri-shell`: `42 passed`
- `npm run test:tauri-shell:browser`: `10 passed`
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs`: passed; the
  follow-up route/proof audit brought Rust to warning-free
- `git diff --check`: passed

Residual release gate:

- This closes the app-wiring gap, not the physical-network proof gap.
- S-grade Private Mesh still requires two separate physical machines joined via
  MUSU Headscale, followed by route verification, delegated order execution,
  callback reconciliation, and archived release proof.

Search terms should include `wiki/1154`, `private_mesh_create_join_key`,
`runDeviceAddPassIssue`, `device-add-pass-generate`, `musu.device_add.v1`,
`musu.create_join_key.v1`, `CREATE_NO_WINDOW`, `stale pass fallback`,
`cockpit-browser.spec.ts`, `private_mesh_bootstrap`,
`private_mesh_start_control_host`, `open_dashboard`, and
`warning-free cargo check`.
