# RELEASE 1.15.0-rc.1 Start Control Host Wiring Audit

**Wiki ID**: wiki/1158

Date: 2026-06-15 KST

Scope:

- Cockpit Add PC `Start control host` action
- `private_mesh_start_control_host` frontend IPC wiring
- browser QA coverage for Add PC setup step 2
- no-copied-command Private Mesh UX contract

## Verdict

The production wiring for `Start control host` already existed, but the browser
QA did not prove it. The Add PC panel showed the button and the static contract
test checked the source, but the end-to-end shell test only clicked `Issue pass`.
That left a practical regression gap: a future edit could break the step-2 IPC
call and the main Add PC browser scenario would still pass.

This pass closed that gap. Browser QA now clicks `Start control host`, verifies
`private_mesh_start_control_host` was invoked, and confirms the user sees
`Control host is up` before continuing to `Issue pass`.

## Researched Surface

Researched files and surfaces:

- `musu-bee/src-tauri-shell/index.html`
- `musu-bee/src-tauri-shell/main.js`
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts`
- `musu-bee/src-tauri-shell/cockpit-browser.spec.ts`
- `musu-bee/src-tauri/src/lib.rs`
- `musu-rs/src/install/private_mesh.rs`

Public surface identified:

- `button#start-control-host`
- `p#start-control-host-result`
- `runStartControlHost()`
- `invoke("private_mesh_start_control_host")`
- Tauri command `private_mesh_start_control_host`
- CLI command `musu mesh start-control-host --json`

Design decision:

- Add PC step 2 is a MUSU product action. The UI should not ask the user to copy
  raw `docker compose` commands for the normal path.

## Code Audit Finding

### Fixed: browser QA proved visibility but not action wiring

Evidence before fix:

- `index.html` exposed `Start control host`.
- `main.js` implemented `runStartControlHost()` and called
  `invoke("private_mesh_start_control_host")`.
- `cockpit-contract.test.ts` asserted the HTML button existed.
- `cockpit-browser.spec.ts` asserted the button was visible but did not click it
  or verify the IPC.

Risk:

- A broken event listener, renamed IPC command, or result rendering regression
  would not be caught by the user-facing browser QA.
- The Add PC setup could again become a partially manual flow even while tests
  stayed green.

Fix:

- Browser mock now handles `private_mesh_start_control_host`.
- The main Add PC browser scenario clicks `Start control host`.
- The test asserts `__startControlHostCalls === 1`.
- The test asserts `#start-control-host-result` contains
  `Control host is up`.
- Static contract test now requires `runStartControlHost()`,
  `invoke("private_mesh_start_control_host")`, and the
  `start-control-host` click listener.

## Verification

Commands run:

- `npm run test:tauri-shell`
  - `42 passed`
- `npm run test:tauri-shell:browser`
  - `10 passed`

## Remaining Risks

- This proves shell wiring, not Docker/Headscale behavior on a real installed
  machine.
- Installed MSIX validation should still click `Generate bundle`, `Start
  control host`, and `Issue pass` on a machine with Docker available.
- Physical two-machine proof remains the release gate for the full Private Mesh
  claim.

Search terms should include `wiki/1158`, `Start control host`,
`private_mesh_start_control_host`, `runStartControlHost`,
`start-control-host-result`, `__startControlHostCalls`,
`musu.start_control_host.v1`, and `no copied docker compose command`.
