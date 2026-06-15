# RELEASE 1.15.0-rc.1 Generate Bundle Fail-Closed Audit

**Wiki ID**: wiki/1162

Date: 2026-06-15 KST

Scope:

- Cockpit Add PC `Generate bundle` input validation
- native IPC fail-closed behavior
- browser QA coverage for empty and malformed mesh host URLs

## Verdict

`Generate bundle` now fails closed in the Cockpit before native IPC for both
missing and malformed mesh host URLs. Before this pass, an empty URL was blocked
in the frontend, but a value such as `mesh.example` still reached
`private_mesh_bootstrap` and relied on the Rust command to reject it. That was
safe at the backend boundary, but weak UX and weak frontend wiring: the desktop
shell should not invoke native command execution for a visibly incomplete URL.

## Finding

### Fixed: scheme-less mesh host reached native IPC

Evidence before fix:

- `main.js::runMeshBootstrap()` checked only `!serverUrl`.
- `lib.rs::private_mesh_bootstrap()` rejected non-`http://` / non-`https://`
  URLs after native IPC was already invoked.
- Browser QA had no assertion that invalid input kept
  `private_mesh_bootstrap` at zero calls.

Risk:

- A user typing `mesh.example` got a native command error instead of immediate
  inline correction.
- The frontend could accidentally shell out malformed inputs if backend
  validation ever changed.
- Browser QA could not distinguish frontend fail-closed behavior from backend
  rejection.

Fix:

- `runMeshBootstrap()` now rejects URLs that do not start with `https://` or
  `http://`, and rejects whitespace before invoking native IPC.
- The inline message tells the user to use a full URL such as
  `https://mesh.your-domain`.
- Browser QA now clicks `Generate bundle` with an empty input and verifies
  `__bootstrapCalls` remains `0`.
- Browser QA fills `mesh.example`, clicks `Generate bundle`, verifies the full
  URL error, and again verifies `__bootstrapCalls` remains `0`.
- Only after filling `https://mesh.example` does browser QA expect
  `__bootstrapCalls === 1`.

## Verification

Commands run:

- `npm run test:tauri-shell`
  - `42 passed`
- `npm run test:tauri-shell:browser`
  - `10 passed`

## Remaining Risks

- Frontend validation is intentionally minimal. The backend remains the
  authoritative validator for URL shape and command execution.
- Installed MSIX validation should still prove the generated bundle on a real
  Docker-capable machine.

Search terms should include `wiki/1162`, `Generate bundle fail-closed`,
`Use a full mesh host URL`, `Enter your mesh host URL first`,
`__bootstrapCalls`, `private_mesh_bootstrap`, `bootstrap-server-url`, and
`native IPC before validation`.
