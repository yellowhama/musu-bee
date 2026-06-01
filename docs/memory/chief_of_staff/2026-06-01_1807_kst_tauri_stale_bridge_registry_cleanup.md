# CoS Memory - Tauri Stale Bridge Registry Cleanup

Date: 2026-06-01 18:07 KST

Follow-up to the 17:53 KST process ownership audit: the audit failed because
no MUSU runtime was running and `~/.musu/services/bridge.json` pointed at dead
PID `32192` on `127.0.0.1:6677`. The machine-wide Node.js processes were
non-MUSU Codex/MCP/npx helpers, so the actionable product issue was stale
bridge registry handling.

Current source update:

- `musu-bee/src-tauri/src/lib.rs` now reads bridge registry status through
  `bridge_registry_status`.
- Windows PID liveness is checked with
  `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`.
- If the recorded bridge PID is dead, `desktop_status` removes the stale
  registry file, returns `bridge_url=null`, and reports stale cleanup in
  `bridge_detail`.
- Live registry entries still return the loopback bridge URL for health
  probing.

Validation:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed
  5/5 tests.
- Added tests:
  - `stale_bridge_registry_is_removed_before_status_probe`
  - `live_bridge_registry_returns_loopback_url`

Release interpretation:

This improves desktop failure handling and process ownership hygiene. It is not
release evidence. Public release still needs live packaged Start Runtime click
evidence, a passing process ownership audit while MUSU is running, and
two-machine 60s CPU evidence.
