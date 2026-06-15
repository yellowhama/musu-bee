# 2026-06-15 Generate Bundle Wiring Audit

Durable memory for wiki/1160.

The Add PC `Generate bundle` production wiring existed, but browser QA only
checked that the URL input and button were visible. It did not click the button
or prove `private_mesh_bootstrap` was invoked.

Fixed coverage:

- `cockpit-browser.spec.ts` mock now handles `private_mesh_bootstrap`.
- The main Add PC browser scenario fills `https://mesh.example`, clicks
  `Generate bundle`, expects `__bootstrapCalls` to reach `1`, verifies the
  `serverUrl` argument, and checks `#bootstrap-result` plus
  `#bootstrap-files`.
- `cockpit-contract.test.ts` now statically requires `runMeshBootstrap()`,
  `invoke("private_mesh_bootstrap", { serverUrl })`, and the click listener.
- The browser path now proves
  `Generate bundle -> Start control host -> Issue pass -> Copy path`.
- Follow-up fail-closed coverage proves empty input and `mesh.example` do not
  invoke native IPC; `__bootstrapCalls` remains `0` until a full URL is entered.

Verification:

- `npm run test:tauri-shell`: `42 passed`
- `npm run test:tauri-shell:browser`: `10 passed`

Product note: this proves desktop shell wiring for Add PC step 1. It does not
replace installed-machine Docker/Headscale proof or physical two-machine
Private Mesh release proof.
