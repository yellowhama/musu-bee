# 2026-06-15 Generate Bundle Fail-Closed Audit

Durable memory for wiki/1162.

`Generate bundle` now fails closed in the Cockpit before native IPC for empty
and scheme-less mesh host URLs.

Change:

- `runMeshBootstrap()` rejects missing URLs before native IPC.
- `runMeshBootstrap()` now also rejects values that do not start with
  `https://` or `http://`, and values containing whitespace, before
  `invoke("private_mesh_bootstrap", { serverUrl })`.
- Browser QA clicks `Generate bundle` with an empty input and with
  `mesh.example`; both cases keep `__bootstrapCalls` at `0`.
- Browser QA then fills `https://mesh.example` and expects
  `__bootstrapCalls === 1`.

Verification:

- `npm run test:tauri-shell`: `42 passed`
- `npm run test:tauri-shell:browser`: `10 passed`

Product note: this improves UX and reduces accidental native command execution
for invalid setup input. Rust remains the authoritative backend validator.
