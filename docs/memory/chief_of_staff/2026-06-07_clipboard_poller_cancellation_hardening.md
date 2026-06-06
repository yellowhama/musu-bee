# 2026-06-07 Clipboard Poller Cancellation Hardening

The opt-in clipboard monitor now has a cancellation contract.

Changed:

- `musu-rs/src/io/clipboard.rs`
  - `start_clipboard_monitor(...)` creates a `CancellationToken`
  - Ctrl-C cancels the token
  - the blocking poll loop runs under `while !worker_token.is_cancelled()`
  - cancellation is rechecked after the 2s sleep before reading the OS
    clipboard
  - the function returns the token for future explicit shutdown use
- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - now gates clipboard cancellation token ownership
  - Ctrl-C cancellation
  - cancellation-scoped blocking spawn
  - 2s sleep
  - exit after cancellation
- `scripts/windows/write-release-go-no-go.ps1`
  - `clipboard polling` idle busy-loop candidate now requires the cancellation
    checks
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - idle busy-loop source contract now fails if the go/no-go mapping regresses

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib clipboard`
  - compiled successfully
  - `0` matching tests, `338` filtered
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=104`
  - `failed_case_count=0`

Product status:

- default packaged idle behavior is unchanged because clipboard polling remains
  off unless `MUSU_ENABLE_CLIPBOARD_SYNC=1`
- this is runtime hardening for an idle busy-loop candidate
- it does not close public release
- after commit, current packaged local evidence is stale until refreshed again

Search terms: `GOAL v754`, `wiki/929`, `clipboard poller cancellation
hardening`, `CancellationToken`, `worker_token.is_cancelled`,
`MUSU_ENABLE_CLIPBOARD_SYNC`, `audit-rust-background-loop-contract.ps1`,
`write-release-go-no-go.ps1`, `case_count=104`.
