# 2026-06-14 Private Mesh Console Flicker And Doc Sync

Durable memory:

- The installed MSIX `1.15.0.2` Start-menu runtime was sampled for passive
  cockpit refresh. Only `musu-desktop.exe` and `musu.exe startup open` were
  observed. `nodes_processes=0`, `mesh_status_processes=0`, and
  `other_child_cli_processes=0`.
- `list_fleet()` no longer spawns `musu.exe nodes --json --local`. It reads the
  local bridge `/api/fleet/status` endpoint directly with bearer auth.
- Follow-up code audit found and fixed a real auth-boundary risk:
  local bridge `401` or `403` now returns `local_fleet_auth_failed` instead of
  being collapsed to an empty fleet and hidden by the local fallback row.
- `private_mesh_status` is cached for five minutes in the cockpit and reuses
  in-flight calls. Explicit proof/release/callback transitions force refresh.
- Public setup docs now present MUSU Private Mesh and
  `musu mesh join --device-add-pass <musu.device_add.v1.json>` as the default
  cross-network path. They must not send users to Tailscale.com as required
  setup.
- `tailnet_ip` is now the preferred public docs term. Legacy `tailscale_ip`
  remains accepted for compatibility and internal route evidence.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_PRIVATE_MESH_CONSOLE_FLICKER_DOC_SYNC_AND_AUDIT_2026_06_14.md`

Verification recorded during this pass:

- `npm run test:tauri-shell`: `42 passed` before the final auth-failure fix.
- `cargo test --manifest-path musu-rs\Cargo.toml private_mesh --lib -j 1`:
  `25 passed`.
- `git diff --check`: passed, with a line-ending warning for `docs/API.md`.

Next required evidence:

- Re-run `npm run test:tauri-shell`.
- Re-run targeted Tauri Rust tests for `http_status_code` and bearer auth.
- Run `cargo check --manifest-path musu-bee\src-tauri\Cargo.toml`.
- Refresh MUSU local indexer and record counts.

Search terms should include `GOAL private mesh`, `console flicker`,
`local_fleet_auth_failed`, `musu.device_add.v1`, `tailnet_ip`,
`No Tailscale.com account`, `nodes_processes=0`, `mesh_status_processes=0`,
and `other_child_cli_processes=0`.
