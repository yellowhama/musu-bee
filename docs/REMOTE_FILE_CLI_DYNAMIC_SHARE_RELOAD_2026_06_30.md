# Remote File CLI Dynamic Share Reload (2026-06-30)

## Summary

The remote file CLI policy blocker exposed a product-flow gap: `musu share`
persisted `~/.musu/shares.toml`, but the running bridge file API only used the
`file_serve_roots` and `file_serve_writable` values captured at bridge startup.
That meant a user could run the correct share command and still need a packaged
bridge restart before sibling `musu ls/get/put` commands could pass.

This source change removes that restart requirement for the remote file API.
The bridge file handlers now reload the current file-serve policy from
`MUSU_FILE_SERVE_ROOTS`, `MUSU_FILE_SERVE_WRITABLE`, and
`~/.musu/shares.toml` while handling each file API request.

## Product Contract Change

- `musu share <PATH> --writable` now becomes visible to remote file API
  requests without a bridge restart once this source is packaged.
- `musu unshare <PATH>` is also reflected by subsequent file API requests
  without a bridge restart.
- The file API remains fail-closed: no configured root still disables the file
  API, and no writable policy still disables write/mkdir/delete.
- Bridge startup still merges `shares.toml` into `file_serve_roots` for
  boot-time file watcher/sync setup. Watcher/sync roots are not hot-reloaded by
  this change.

## Files Changed

- `musu-rs/src/bridge/handlers/files.rs`
  - Adds request-time `FileServePolicy` loading.
  - Uses current policy for list/read/info/write/mkdir/delete.
  - Adds regression tests for share and unshare visibility without bridge
    restart.
- `musu-rs/src/install/shares.rs`
  - Updates the module contract comment.
- `musu-rs/src/install/cli_commands.rs`
  - Updates `musu share` output to distinguish remote file API hot reload from
    file watcher/sync startup behavior.

## Verification

- `cargo test --manifest-path musu-rs\Cargo.toml file_serve_policy --lib -j 1`
  - `2 passed`
- `rustfmt --edition 2021 --check musu-rs\src\bridge\handlers\files.rs`
  - passed
- `test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`, `case_count=219`, `failed_case_count=0`

`cargo fmt --manifest-path musu-rs\Cargo.toml -- --check` was also attempted,
but it reports pre-existing formatting differences in unrelated Rust files. No
repo-wide formatting rewrite was applied.

## Release Meaning

This is a source-level usability and proof-path fix. It does not by itself
close the physical remote file proof because the installed package on both PCs
must be rebuilt/reinstalled before this behavior exists in the packaged bridge,
and `hugh-main` still needs a writable proof share configured.

2026-06-30 23:20 KST update: this source change has now been rebuilt and
reinstalled on `HUGH_SECOND`; current local package evidence is recorded in
`docs/CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_30.md`. The second PC
still needs the current kit installed before the physical `musu put/ls/get`
proof can close.

After the next package refresh, the expected physical proof flow is:

```powershell
New-Item -ItemType Directory -Force C:\Users\empty\.musu\codex-remote-file-proof
musu share C:\Users\empty\.musu\codex-remote-file-proof --writable --label remote-file-cli-proof
```

Then rerun the sibling proof from `hugh_second`. A packaged bridge restart
should no longer be required for the file API share policy itself.

## Remaining Product Blockers

This change does not close the full-product blockers in go/no-go:

- second-PC multi-device evidence
- Private Mesh packaged proof archive
- second-machine idle CPU and runtime CPU matrix
- public metadata DNS/TLS
- Store/Partner Center evidence
- live P2P control-plane evidence
- explicit design approval
- real release relay transport
- V34 stale self-heal physical proof
