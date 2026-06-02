# MUSU 1.15.0-rc.1 File Sync Watcher Storm Hardening

Date: 2026-06-02 16:50 KST
Wiki ID: wiki/557

## Scope

This pass targets one remaining optional background-work risk in the desktop
hardening plan: file sync watcher storms.

File sync remains opt-in because it only starts when shared file roots are
configured. Still, once enabled, the previous watcher path used an unbounded
channel and a debounce loop that could keep collecting events indefinitely
while a watched directory was changing continuously. That is not acceptable for
the release resource-budget model.

## Change

`musu-rs/src/install/sync.rs` now enforces explicit limits:

- watcher queue is bounded at `1024` events
- batch collection is capped at `256` events
- batch collection window is capped at `2s`
- debounce remains `500ms`, but it no longer permits an endless collect loop
- same-path events in a batch are coalesced so only the latest event for each
  path is processed
- when the batch cap is hit, the loop logs and yields for `50ms` before taking
  more events

This turns file sync from "process everything as fast as the OS emits it" into a
bounded background worker that can shed load during storms.

## Validation

From `F:\workspace\musu-bee`:

```powershell
cargo fmt --manifest-path .\musu-rs\Cargo.toml --check
cargo test --manifest-path .\musu-rs\Cargo.toml install::sync --lib -- --test-threads=1
git diff --check
```

Results:

- format check passed
- targeted Rust unit test passed: `coalesce_sync_batch_keeps_latest_event_for_each_path`
- whitespace check passed

## Release Impact

This is runtime Rust source, so previously recorded primary MSIX/single-machine
smoke/CPU/matrix evidence becomes stale after commit. The change reduces an
optional background-loop risk but does not close the public release gate by
itself.

Required next evidence after this commit:

- rebuild/install MSIX
- rerun desktop single-instance
- rerun process ownership
- rerun single-machine smoke
- rerun desktop-open idle CPU
- rerun four-state runtime CPU scenario matrix

Public release remains No-Go until second-PC CPU/matrix/route evidence, live
`musu.pro` owner-scoped P2P evidence, `musu@musu.pro` mailbox evidence, and
Store evidence are complete.
