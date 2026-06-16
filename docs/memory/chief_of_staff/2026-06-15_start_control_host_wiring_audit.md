# 2026-06-15 Start Control Host Wiring Audit

Durable memory for wiki/1158.

The Add PC `Start control host` production wiring existed, but browser QA only
checked the button was visible. It did not click the button or prove
`private_mesh_start_control_host` was invoked.

Fixed coverage:

- `cockpit-browser.spec.ts` mock now handles
  `private_mesh_start_control_host`.
- The main Add PC browser scenario clicks `Start control host`, expects
  `__startControlHostCalls` to reach `1`, and verifies
  `#start-control-host-result` contains `Control host is up`.
- `cockpit-contract.test.ts` now statically requires `runStartControlHost()`,
  `invoke("private_mesh_start_control_host")`, and the click listener.

Verification:

- `npm run test:tauri-shell`: `42 passed`
- `npm run test:tauri-shell:browser`: `10 passed`

Product note: this proves desktop shell wiring for Add PC step 2. It does not
replace installed-machine Docker/Headscale proof or physical two-machine
Private Mesh release proof.
