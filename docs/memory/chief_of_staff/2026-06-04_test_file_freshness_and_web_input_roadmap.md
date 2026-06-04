# 2026-06-04 Test File Freshness and Web Input Roadmap

Release freshness classifiers now treat TypeScript test/spec source files as
status-only changes: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, and `*.spec.tsx`.

This fixes the false stale-evidence result from adding the route-evidence
regression test; that test changed release gate coverage, not packaged runtime
behavior.

Roadmap lock:

- `localhost` dashboards are local-only operator/dev surfaces.
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane.
- local MUSU programs execute work on each device.
- devices may use `musu.pro` for identity/presence/rendezvous, then prefer P2P
  mesh after connection.
- relay remains fallback only, not the default data path.

Validation passed PowerShell parser checks and release evidence verifier
regression `ok=true`, `case_count=28`, `failed_case_count=0`.

Clean go/no-go on `dd4fb7efab643c52cc47bcbb6ddd921058ef437a` restored
`local_artifacts_ready=true`, `single_machine_verified=true`,
`msix_install_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU
matrix `1/2 [HUGH_SECOND]`, and `manifest_git.dirty=false`.

Remaining blockers are unchanged: second-PC multi-device evidence, second-PC
CPU/matrix evidence, support mailbox, Store/Partner Center, and hosted
`musu.pro` P2P control-plane proof.
