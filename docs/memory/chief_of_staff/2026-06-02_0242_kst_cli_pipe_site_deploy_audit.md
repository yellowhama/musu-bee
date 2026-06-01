# 2026-06-02 02:42 KST - CLI pipe hardening and `musu.pro` deploy recheck

The direct Windows CLI path `musu up --json | ConvertFrom-Json` had a real hang
class when `musu up` spawned a fresh long-lived bridge: the parent emitted JSON
and exited, but the bridge child could keep the caller stdout pipe open.

Source now hardens `spawn_bridge_process()` in
`musu-rs/src/install/cli_commands.rs`: bridge stdout/stderr still go to
`~/.musu/logs/bridge.log`, Windows clears standard-handle inheritance before
spawn, and the child uses `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP |
CREATE_NO_WINDOW`. Validation passed `cargo check --bin musu -j 1`,
`cargo build --bin musu -j 1`, `cargo fmt --check`, and `git diff --check`.
The fresh debug-binary pipe test returned `ok=true`, `bridge_started=true`,
bridge PID `37284`, bridge status `ok`, URL `http://127.0.0.1:5692`, without
hanging; PID `37284` was stopped after the test.

Live `https://musu.pro` was also rechecked on `/`, `/landing`, `/pricing`, and
`/install` across desktop/mobile. It passed scroll movement, no horizontal
overflow, favicon-header logo, `.musu-public-scroll-root`, and `#24C8DB`
emerald accent. The public UI deploy question is closed for this scope. The
remaining hosted blocker is production P2P control-plane auth/env verification,
not another scroll/logo/accent deploy.

Clean go/no-go after the source fix reports `manifest_dirty=false` but
`single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU scenario
matrix `0/2`, P2P control-plane false, support false, and Store false. This is
the expected evidence-freshness reset after changing Rust CLI source. Build a
fresh MSIX with this fix before treating the prior primary MSIX/CPU evidence as
current again.

Next release-grade action: include the CLI pipe hardening in a fresh MSIX and
verify the same direct pipeline through
`$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe`, then continue second-PC
CPU/matrix, release-grade route, P2P control-plane, `musu@musu.pro`, and Store
evidence.
