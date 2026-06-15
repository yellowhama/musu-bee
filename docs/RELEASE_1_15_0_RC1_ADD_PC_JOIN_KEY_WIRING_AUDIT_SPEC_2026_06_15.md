# RELEASE 1.15.0-rc.1 Add PC Join-Key Wiring Audit And Spec Refresh

**Wiki ID**: wiki/1154

Date: 2026-06-15 KST

Scope:

- Cockpit Add PC UX
- `private_mesh_create_join_key` Tauri IPC
- `musu mesh create-join-key --json`
- generated Headscale `musu.device_add.v1` enrollment pass flow
- Private Mesh no-Tailscale.com product boundary

## Verdict

MUSU is closer to the "my machines as one device" product, but the current
HEAD had one product-breaking mismatch: the backend could mint a device-add
pass, while the Cockpit still told the user to copy and run
`scripts/create-join-key.ps1` by hand. That contradicted the new spec that Add
PC must be a product action, not an operator script ritual.

This pass fixed that mismatch. The Add PC panel now exposes an in-app
`Issue pass` action wired to `private_mesh_create_join_key`, shows only the
generated pass file path, and keeps the target-side join command as
`musu mesh join --device-add-pass <musu.device_add.v1.json>`.

Qualitative rating after this pass:

- single-machine Cockpit UX: strong
- Private Mesh product direction: strong
- Add PC setup UX: improved from "manual script copy" to "app action"
- release evidence: not S-grade yet because physical two-machine Headscale
  enrollment and route/callback proof still needs to be run on separate
  hardware

## Product Spec Update

The current product contract is:

1. MUSU must not require Tailscale.com signup as the default setup path.
2. MUSU may use a Tailscale-compatible client as a local overlay client, but
   the default control plane is MUSU/operator-owned Headscale.
3. Add PC enrollment is represented to the user as a MUSU
   `musu.device_add.v1` pass, not as raw Headscale preauth-key mechanics.
4. The Cockpit issues the pass through `private_mesh_create_join_key`; users
   should not have to copy `scripts/create-join-key.ps1` for the normal path.
5. The pass file is secret-bearing. The Cockpit shows/copies the path only, not
   the raw `hskey-auth-*` value.
6. `musu mesh join --device-add-pass <musu.device_add.v1.json>` consumes the
   pass after a successful join and writes a redacted `.used` marker.
7. A successful software path still does not prove the network product until
   the route is verified between separate physical machines through MUSU
   Headscale.

## Code Audit Findings

### Fixed: browser QA still expected the old Add PC contract

Evidence before fix:

- `cockpit-contract.test.ts` had been updated for the new `Issue pass` action.
- `cockpit-browser.spec.ts` still expected old Add PC copy:
  `musu mesh bootstrap --server-url` and
  `writes a one-use MUSU device-add pass file`.

Risk:

- The source-level contract test could pass while the user-facing browser QA
  still failed or, worse, kept validating the wrong product contract.

Fix:

- Browser QA now executes the productized Add PC path:
  `Generate bundle -> Start control host -> Issue pass -> Copy path`.
  It verifies `private_mesh_bootstrap`,
  `private_mesh_start_control_host`, `private_mesh_create_join_key`,
  bundle-result rendering, pass-path rendering, and copy behavior.
- Browser QA now asserts the old `scripts\create-join-key.ps1` copy surface is
  absent from the Add PC panel.

### Fixed: Add PC UI did not call the new IPC

Evidence before fix:

- `musu-bee/src-tauri/src/lib.rs` registered `private_mesh_create_join_key`.
- `musu-rs/src/install/private_mesh.rs` added `CreateJoinKey`.
- `musu-bee/src-tauri-shell/index.html` still rendered
  `powershell -ExecutionPolicy Bypass -File .\scripts\create-join-key.ps1`.
- `musu-bee/src-tauri-shell/main.js` had no call to
  `invoke("private_mesh_create_join_key")`.

Fix:

- Add PC step now renders `Issue pass`, `Copy path`, and a result surface.
- `runDeviceAddPassIssue()` calls `private_mesh_create_join_key`, disables the
  button while running, renders success/error states, and exposes only
  `pass_path` to the copy affordance.
- Contract tests now require the IPC wiring and reject the old
  `scripts\create-join-key.ps1` copy affordance.

### Fixed: stale pass fallback could show the wrong file

Evidence before fix:

- `run_create_join_key()` compared pass files before/after helper execution.
- If no new file appeared, it fell back to `passes_after.last()`.

Risk:

- A helper success without a new pass, timestamp collision, or stale
  `device-add-passes/*.json` directory could cause the Cockpit to show an old
  or already-consumed pass as if it had just been minted.

Fix:

- Removed the fallback. If no new pass file appears, the command fails with
  `create-join-key helper ran but no new device-add pass file was produced`.

### Mitigated: helper child process could reintroduce console flicker

Evidence before fix:

- Tauri's top-level `musu.exe mesh create-join-key --json` call used the hidden
  desktop command runner.
- Inside the CLI, Windows still spawned `powershell` for the generated helper.

Fix:

- Windows helper invocation now adds `-NoProfile -NonInteractive`.
- The helper child process receives `CREATE_NO_WINDOW`, matching the desktop
  no-flicker contract.

### Fixed: dormant `open_dashboard` IPC is now diagnostics-only UI

Mechanical IPC inventory:

- Registered Tauri commands: `22`
- Frontend-invoked commands before fix: `21`
- Invoked-but-not-registered commands: `0`
- Registered-but-not-invoked commands before fix: `open_dashboard`

Risk:

- A registered Tauri command with no user-facing call path creates unclear
  product surface and makes IPC audits noisy.

Fix:

- The diagnostics drawer now shows a Dashboard status row.
- `Open dashboard` appears only when `desktop_status.dashboard_url` is present.
- Clicking it calls `open_dashboard`.
- Browser QA opens diagnostics, verifies the dashboard button, clicks it, and
  proves the IPC call.

Post-fix inventory:

- Registered Tauri commands: `22`
- Frontend-invoked commands: `22`
- Invoked-but-not-registered commands: `0`
- Registered-but-not-invoked commands: `0`

## Verification

Commands run:

- `npm run test:tauri-shell`
  - `42 passed`
- `npm run test:tauri-shell:browser`
  - `10 passed`
  - browser QA now clicks `Generate bundle`, `Start control host`, and
    `Issue pass` in the Add PC panel
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs`
  - passed
  - later route/proof cleanup brought the Rust check to warning-free
- `git diff --check`
  - passed

## Remaining Risks

- Physical two-machine proof is still required. The current repo proves the
  software wiring and local product contract; it does not yet prove a genuinely
  different network path between two separate machines.
- Direct CLI `musu mesh create-join-key` now delegates to the generated helper
  under a bounded helper timeout. See wiki/1164 for the backend timeout audit.
- The generated pass is a secret-bearing local JSON file. The current UX copies
  only the file path, but the next setup wizard should also guide secure
  transfer and cleanup.
- Preview relay payload fallback is not a production QUIC relay tunnel. The
  release relay submission placeholder is now test-only; a real QUIC/TLS relay
  runtime remains future work.

## Next Step Plan

1. Run Add PC on the installed MSIX build, click `Generate bundle`, start the
   control host, click `Issue pass`, and confirm no terminal window flashes.
2. Use the generated `musu.device_add.v1` pass on a second physical machine.
3. Run `musu mesh verify --target-ip <peer-100.x.y.z>` from both directions.
4. Send a Cockpit order to the peer and verify delegated execution plus
   callback reconciliation on the source card.
5. Archive release proof with physical peer evidence and SHA256 sidecars.
6. Only after that proof, update the qualitative verdict from "software path
   ready" to "physical Private Mesh ready."

Search terms should include `wiki/1154`, `private_mesh_create_join_key`,
`runDeviceAddPassIssue`, `device-add-pass-generate`, `musu.create_join_key.v1`,
`musu.device_add.v1`, `CREATE_NO_WINDOW`, `stale pass fallback`,
`cockpit-browser.spec.ts`, `private_mesh_bootstrap`,
`private_mesh_start_control_host`, `open_dashboard`, and
`warning-free cargo check`.
