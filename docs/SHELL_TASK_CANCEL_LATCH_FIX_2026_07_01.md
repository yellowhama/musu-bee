# Shell Task Cancel Latch Fix (2026-07-01)

## Scope

This closes the source-level reliability issue found during
`docs/REMOTE_FILE_SHARE_AND_SHELL_CANCEL_AUDIT_2026_07_01.md`.

Baseline before this source change:

- Branch: `feat/v33-residual-finalize`
- Previous pushed HEAD: `80585bd7cafe8f51d0087a8963b3c29693aac345`
- Observed stuck task:
  `9dba3497-c80c-417a-8e59-dcb4a2d869ea`
- User-visible symptom: direct `DELETE /api/tasks/9dba...` returned
  `cancelled=true`, but `GET /api/tasks/9dba...` still returned
  `status=running`.

## Root Cause

Two issues overlapped.

1. `musu-rs/src/adapter/shell.rs` waited on the shell child before handling
   `CliOutcome::Cancelled`, `Timeout`, or `IoError`. If the command was long
   running, or spawned a background child that kept the process group/stdout
   alive, the adapter could keep waiting after cancellation was signalled.

2. `TaskRunnerHandle::cancel` used `Notify::notify_waiters()`. That method
   wakes only currently parked waiters and does not latch a cancellation permit.
   If the signal arrived while an adapter was between `notified()` polls, the
   cancellation could be missed.

## Source Fix

Changed files:

- `musu-rs/src/adapter/shell.rs`
- `musu-rs/src/writer/runner.rs`
- `docs/API.md`

Behavioral changes:

- Shell adapter finalization now mirrors the safer subprocess adapters:
  `Done` waits for exit with a bounded timeout, while `Cancelled`, `Timeout`,
  and `IoError` call `writer::runner::graceful_kill` before returning.
- `TaskRunnerHandle::cancel` now calls `notify_one()` before
  `notify_waiters()`. This makes cancellation behave as a latched signal for
  the next `notified()` check while still waking an already parked waiter.
- API docs now describe the current Rust response shape:
  `{ "task_id": "...", "cancelled": true }`.

## Verification

Focused tests passed on `HUGH_SECOND`:

```powershell
cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 shell_cancel_signal_returns_promptly --lib -- --nocapture --test-threads=1
```

Result: `1 passed; 0 failed`.

```powershell
cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 adapter::shell::tests:: --lib -- --nocapture --test-threads=1
```

Result: `4 passed; 0 failed`.

```powershell
cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 cancel_signal_transitions_to_cancelled --lib -- --nocapture --test-threads=1
```

Result: `1 passed; 0 failed`.

The first test intentionally runs a long Windows shell command
(`ping 127.0.0.1 -n 30`) and sends cancellation after 200 ms. Before the latch
fix, that path waited for the command to finish. After the fix, it returns
promptly with a cancellation error.

## Product Meaning

This is a source-level fix, not a package or two-PC proof.

What improved:

- Future packaged builds should not acknowledge a task cancel while silently
  losing the cancellation signal.
- Future shell tasks should kill the subprocess path on cancel/timeout/error
  instead of waiting indefinitely in the adapter finalizer.

Still not complete:

- The already installed `hugh-main` package does not contain this source fix.
- The stuck `9dba3497-c80c-417a-8e59-dcb4a2d869ea` row was observed on the old
  installed runtime and still needs target-side restart/orphan cleanup.
- The remote file proof is still blocked until `hugh-main` applies the
  registered share policy and `musu ls` / `musu put` / `musu get` pass from
  `hugh_second`.
- Full product completion remains NO-GO. This does not close release-grade
  multi-device, runtime CPU, Private Mesh, public metadata, Store, P2P,
  relay-transport, design approval, or V34 gates.

## Next Required Steps

1. Rebuild/package this source fix before using shell cancel as release
   evidence.
2. On `hugh-main`, run local bridge lifecycle commands, not remote shell:

```powershell
musu down --json --timeout-sec 5
musu up --json --timeout-sec 30
```

3. From `hugh_second`, rerun remote file proof against:

```text
hugh-main:C:\Users\empty\.musu\codex-remote-file-proof
```

4. After packaging this fix, rerun a two-PC shell cancel proof from the
   installed package and verify the task row reaches a terminal state.

## Indexing And Recall

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3677 files` and `3949 symbols`.
- Product brain CLI ingest under `~/.musu/brain`, tenant/workspace
  `local/musu`, ingested `8` sources:
  `shell.rs`, `runner.rs`, this report, the remote file/share audit, the full
  product roadmap, `docs/WIKI.md`, `docs/WIKI_INDEX.md`, and `docs/API.md`.
- `musu-brain process -root ~/.musu/brain -tenant local -workspace musu`
  reported `processed: 8`.
- Recall query
  `SHELL_TASK_CANCEL_LATCH_FIX_2026_07_01 TaskRunnerHandle cancel notify_one`
  returned this source-fix report as the top result.
- Recall query
  `shell_cancel_signal_returns_promptly CliOutcome Cancelled graceful_kill runner.rs`
  returned the indexed `runner.rs` source as the top result and this report as
  the second result.

## Qualitative Assessment

The code fix is small and targeted. The risk is mainly semantic: `Notify` is
still being used as a cancellation primitive, but `notify_one()` makes the
current single-waiter runner design behave as intended without changing the
adapter trait or task registry type. A future cleanup could replace this with
`tokio_util::sync::CancellationToken`, but that is a broader API migration and
is not needed to close the observed source bug.
