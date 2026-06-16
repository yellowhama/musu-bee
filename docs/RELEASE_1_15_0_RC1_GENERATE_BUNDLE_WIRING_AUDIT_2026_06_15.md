# RELEASE 1.15.0-rc.1 Generate Bundle Wiring Audit

**Wiki ID**: wiki/1160

Date: 2026-06-15 KST

Scope:

- Cockpit Add PC `Generate bundle` action
- `private_mesh_bootstrap` frontend IPC wiring
- browser QA coverage for Add PC setup step 1
- no-copied-bootstrap-command Private Mesh UX contract

## Verdict

The production `Generate bundle` wiring existed, but the browser QA only proved
that the button was visible. It did not fill the mesh URL, click the button,
verify `private_mesh_bootstrap`, or confirm that the generated bundle result and
file list rendered. That left a real gap: Add PC step 1 could regress back into
a dead button while the main desktop shell browser QA stayed green.

This pass closed that gap. The main Add PC browser scenario now executes the
full productized setup path:

`Generate bundle -> Start control host -> Issue pass -> Copy path`

Follow-up fail-closed hardening also ensures empty or scheme-less mesh host URLs
do not invoke native IPC before the user sees an inline correction.

## Researched Surface

Researched files and surfaces:

- `musu-bee/src-tauri-shell/index.html`
- `musu-bee/src-tauri-shell/main.js`
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts`
- `musu-bee/src-tauri-shell/cockpit-browser.spec.ts`
- `musu-bee/src-tauri/src/lib.rs`
- `musu-rs/src/install/private_mesh.rs`

Public surface identified:

- `input#bootstrap-server-url`
- `button#bootstrap-generate`
- `p#bootstrap-result`
- `ul#bootstrap-files`
- `runMeshBootstrap()`
- `invoke("private_mesh_bootstrap", { serverUrl })`
- Tauri command `private_mesh_bootstrap`
- CLI command `musu mesh bootstrap --server-url <url> --json`

Design decision:

- Add PC step 1 is a MUSU product action. The normal UX should not ask the user
  to copy `musu mesh bootstrap --server-url ...`; the Cockpit collects the URL,
  calls the IPC, and shows the bundle output in place.

## Code Audit Finding

### Fixed: browser QA proved visibility but not bundle generation wiring

Evidence before fix:

- `main.js` implemented `runMeshBootstrap()` and called
  `invoke("private_mesh_bootstrap", { serverUrl })`.
- `lib.rs` exposed `private_mesh_bootstrap` and proxied
  `musu mesh bootstrap --server-url <url> --json`.
- `cockpit-browser.spec.ts` only checked that the input and `Generate bundle`
  button were visible.
- The browser mock did not implement `private_mesh_bootstrap`.

Risk:

- A broken listener, bad IPC name, bad argument shape, or result-rendering
  regression would not be caught by browser QA.
- The product could appear to have an Add PC wizard while the first step was
  actually dead.

Fix:

- Browser mock now handles `private_mesh_bootstrap`.
- The main Add PC browser scenario fills `https://mesh.example`.
- The test clicks `Generate bundle`.
- The test asserts `__bootstrapCalls === 1`.
- The test asserts the IPC argument preserves `serverUrl`.
- The test asserts `#bootstrap-result` shows the generated bundle directory.
- The test asserts `#bootstrap-files` renders generated files such as
  `docker-compose.yml` and `config/headscale.yaml`.
- The test first proves empty input and `mesh.example` fail closed before
  native IPC by keeping `__bootstrapCalls` at `0`.
- Static contract test now requires `runMeshBootstrap()`,
  `invoke("private_mesh_bootstrap", { serverUrl })`, and the
  `bootstrap-generate` click listener.

## Verification

Commands run:

- `npm run test:tauri-shell`
  - `42 passed`
- `npm run test:tauri-shell:browser`
  - `10 passed`

## Remaining Risks

- This proves desktop shell wiring, not actual Docker/Headscale bundle
  generation on an installed machine.
- Installed MSIX validation should still run the wizard against a real Docker
  environment.
- Physical two-machine Private Mesh proof remains required before the full
  network claim is release-grade.

Search terms should include `wiki/1160`, `Generate bundle`,
`private_mesh_bootstrap`, `runMeshBootstrap`, `bootstrap-server-url`,
`bootstrap-result`, `bootstrap-files`, `__bootstrapCalls`,
`musu.private_mesh_bootstrap.v1`, and `no copied bootstrap command`.
