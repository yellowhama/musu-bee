# 2026-06-02 16:50 KST File Sync Watcher Storm Hardening

## Decision

Optional file sync must not be allowed to turn watched-directory churn into an
unbounded background worker.

## What Changed

- `musu-rs/src/install/sync.rs` now uses a bounded `tokio::sync::mpsc` queue
  with capacity `1024` instead of an unbounded channel.
- Batch collection now stops at `256` events or `2s`, whichever comes first.
- Same-path events are coalesced to the latest event before processing.
- A batch-cap hit logs a warning and yields for `50ms` before the next batch.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::sync --lib -- --test-threads=1`
  passed the targeted coalescing unit test.
- `git diff --check` passed.

## Gate Meaning

This reduces an optional background-loop/resource-budget risk. It is runtime
Rust source, so current primary MSIX/smoke/CPU/matrix evidence must be refreshed
after commit before current-HEAD release claims are valid.

## Index Refresh

`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
1366 files and 2242 symbols after this hardening pass. Search terms include
`GOAL v317`, `GOAL v318`, `wiki/557`, `SYNC_EVENT_QUEUE_CAPACITY`,
`SYNC_BATCH_MAX_EVENTS`, `SYNC_BATCH_MAX_WINDOW`, `SYNC_BATCH_COOLDOWN`,
`coalesce_sync_batch`, and
`coalesce_sync_batch_keeps_latest_event_for_each_path`.
