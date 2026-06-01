# 2026-06-01 19:19 KST - Hardware Probe Timeout Hardening

Context:

- The operator asked whether the public scroll/logo/accent change should be deployed to `musu.pro`.
- Live checks confirmed `https://musu.pro` is already serving the fix: `/`, `/privacy`, and `/support` returned HTTP 200; desktop/mobile browser QA confirmed homepage scroll, no horizontal overflow, favicon-header logo, `data-brand-accent=emerald`, and `--musu-color-brand-emerald=#24C8DB`.
- While continuing runtime hardening, the remaining background-loop audit found that logged-in cloud heartbeat calls `gather_hardware_info()`, and that helper still used timeout-less platform command probes.

Change:

- `musu-rs/src/peer/hardware.rs` now routes Windows PowerShell/WMIC, macOS `sysctl`, and `nvidia-smi` probes through `command_stdout_with_timeout()`.
- Probes close stdin, discard stderr, capture stdout only after process exit, and are killed after 5s.
- Missing, failing, or timed-out probes degrade to fallback hardware metadata instead of blocking the cloud heartbeat path.

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed.
- `git diff --check` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib peer::hardware::tests -- --nocapture` passed 2/2 Windows tests.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.

Release state:

- This removes another background stall candidate but does not close runtime CPU evidence.
- Commit `4f099bf` was pushed and GitHub `Tests` run `26749151136` passed.
- Clean post-push go/no-go now reports public metadata ok, MSIX install ok, `manifest_dirty=false`, but `single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, multi-device false, support false, and Store false.
- Because this source commit invalidated earlier primary smoke/CPU evidence, the next evidence step must refresh primary single-machine smoke, primary packaged `desktop-open` CPU, and primary 4-state CPU matrix before second-PC evidence can close the two-machine runtime gates.
- Public release remains No-Go until refreshed primary evidence, second-PC desktop-open CPU evidence, second-PC runtime CPU scenario matrix evidence, release-grade multi-device route proof, production `MUSU_P2P_CONTROL_TOKEN_SHA256S` verification, `musu@musu.pro` delivery evidence, and Store evidence are complete.
