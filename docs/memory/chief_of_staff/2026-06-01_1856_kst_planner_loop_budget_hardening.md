# 2026-06-01 18:56 KST — Planner Loop Budget Hardening

## What Changed

- The optional autonomous planner loop remains disabled by default behind
  `MUSU_ENABLE_PLANNER=1`.
- When enabled, `MUSU_PLANNER_INTERVAL_SEC` is now floored at 60s. A bad env
  value such as `0` can no longer create a tight planner loop.
- Planner crawler execution is now timeout-bounded with
  `MUSU_PLANNER_COMMAND_TIMEOUT_SEC`, default `20`, floor `5`, ceiling `120`.
- The crawler command uses `tokio::process::Command`, `stdin=null`, piped
  output, `kill_on_drop(true)`, and `tokio::time::timeout` instead of blocking
  the async runtime on `std::process::Command::output()`.
- `musu doctor --json` now reports planner interval and command-timeout budget
  fields.

## Evidence

- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib brain::planner::tests -- --nocapture`
  passed 2/2.
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib cli_commands::tests::doctor_background -- --nocapture`
  passed 4/4.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `git diff --check` passed.
- Live bad-env doctor check with `MUSU_ENABLE_PLANNER=1`,
  `MUSU_PLANNER_INTERVAL_SEC=0`, and
  `MUSU_PLANNER_COMMAND_TIMEOUT_SEC=9999` reported
  `planner_interval_sec=60`, `planner_command_timeout_sec=120`, and
  `background.status=warn`.

## Release Interpretation

This closes a hardening gap for one optional background loop. It does not close
the public CPU release gate. Public release still needs clean/current 60s
desktop-open CPU evidence and 4-state runtime CPU matrices on both primary and
second Windows PCs, plus real multi-device route evidence, `musu@musu.pro`
mailbox evidence, Store evidence, and production P2P control auth env
verification.
