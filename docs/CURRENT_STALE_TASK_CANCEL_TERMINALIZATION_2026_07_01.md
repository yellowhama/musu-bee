# Current Stale Task Cancel Terminalization - 2026-07-01

**Wiki ID**: wiki/1230

This report records the source-level fix for the stale `running` task risk found
in `wiki/1229`.

## Status

- Branch: `feat/v33-residual-finalize`
- Base before this change: `25f04f7c4fa4f24ba52c4a4c3e1e22c248c9bdf7`
- Scope: Rust writer task cancellation, task DB terminalization, API contract
  documentation.
- Product status: still NO-GO until this source change is rebuilt, installed,
  and proved on the physical fleet.

## Product Meaning

Before this change, `DELETE /api/tasks/{task_id}` only signalled the live
`TaskRunner` registry entry. If the live adapter or runner failed to reach its
own finalizer, the `route_executions` row could remain `running` and keep
fleet/status proof logically busy. That matched the observed `hugh-main` state
in `wiki/1229`, where task `9dba3497-c80c-417a-8e59-dcb4a2d869ea` still
reported `running` after cancel attempts.

After this change, a successful cancel signal also attempts an immediate,
conditional DB terminalization:

- `pending` / `running` rows become `cancelled`.
- `error` becomes `cancel signal delivered`.
- `updated_at` is refreshed.
- SSE and `TaskUpdate` receive a `cancelled` update.
- The HTTP response includes `terminalized`.

The live runner still receives the latched cancel signal and can perform normal
process cleanup. The terminalization only changes the read/status surface so a
wedged adapter cannot keep the node logically busy forever after a successful
operator cancel.

## Code Changes

- `musu-rs/src/writer/runner.rs`
  - Added `TaskRunnerHandle::cancel_and_terminalize`.
  - Added `mark_cancelled_by_operator`.
  - Added regression test
    `writer::runner::tests::cancel_terminalizes_db_row_immediately`.
- `musu-rs/src/writer/cancel.rs`
  - The HTTP cancel handler now calls `cancel_and_terminalize`.
  - `CancelResponse` now includes `terminalized`.
  - Audit notes include `db_terminalized=<bool>`.
- `docs/API.md`
  - Documents the cancel terminalization behavior and response field.

## Verification

Commands run:

```powershell
cargo test --manifest-path musu-rs\Cargo.toml cancel_terminalizes_db_row_immediately --lib -j 1
cargo test --manifest-path musu-rs\Cargo.toml cancel_signal_transitions_to_cancelled --lib -j 1
cargo test --manifest-path musu-rs\Cargo.toml cancel_ --lib -j 1
```

Results:

- `cancel_terminalizes_db_row_immediately`: passed.
- `cancel_signal_transitions_to_cancelled`: passed.
- `cancel_` filter: `3 passed; 0 failed` (`cancel_terminalizes_db_row_immediately`,
  `cancel_signal_transitions_to_cancelled`, and
  `adapter::shell::tests::shell_cancel_signal_returns_promptly`).

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  returned `indexed 3747 files (3952 symbols)`.
- Product brain primary refresh ingested and processed `7` changed code/docs
  sources into `C:\Users\empty\.musu\brain` tenant `local`, workspace `musu`;
  after this indexing section was written, a final docs-only refresh processed
  `4` changed docs.
- Recall query:
  `wiki/1230 cancel_and_terminalize terminalized db_terminalized stale running
  task route_executions cancel signal delivered`.
- Recall result: the canonical stale task cancel terminalization report was the
  top result.

## Remaining Release Work

This source fix does not close the full product spec by itself.

Required next evidence:

1. Rebuild and reinstall the package from the new source commit.
2. Run fleet proof from both PCs.
3. Verify that cancelling a live remote task no longer leaves
   `route_executions.status='running'`.
4. Re-run strict runtime CPU scenario matrix after the target node is clean.
5. Re-run `write-release-go-no-go.ps1 -Json`.

The existing `hugh-main` stale task may still require a local bridge restart or
local cleanup on that machine if it is running an older build.
