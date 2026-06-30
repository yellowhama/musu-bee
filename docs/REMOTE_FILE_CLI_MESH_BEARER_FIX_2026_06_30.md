# Remote File CLI Mesh Bearer Fix (2026-06-30)

## Verdict

The source-level bug is fixed, but the packaged product gate is not closed yet.

During the two-PC audit, `musu route -t hugh-main --adapter echo` succeeded
from `hugh_second` to `hugh-main`, proving that the current installed rc.22
package can submit and complete direct delegated work over the LAN route.
However, peer file commands (`musu ls`, `musu get`, and `musu put`) failed
against the same sibling node with `unauthorized: invalid bearer`.

Root cause: remote file CLI commands used the local bridge token path
(`get_token()`), while route submission already used the outbound peer token
path (`get_outbound_peer_token(&home)`) that prefers the account-wide mesh
bearer. A local bridge token is valid for the local packaged bridge, not for a
sibling machine's bridge. That made route targetability green while remote file
operations were not actually usable between the two installed PCs.

## Source Change

Changed `musu-rs/src/install/cli_commands.rs` so all remote file commands use
the same outbound-peer token policy as `musu route`:

- `run_ls`: `get_outbound_peer_token(&home)`
- `run_get`: `get_outbound_peer_token(&home)`
- `run_put`: `get_outbound_peer_token(&home)`

The outbound peer token precedence remains:

1. `MUSU_TOKEN`
2. `MUSU_MESH_BEARER` through `read_mesh_bearer(...)`
3. persisted mesh bearer under the MUSU home through `read_mesh_bearer(...)`
4. local bridge token fallback

## Verification

Targeted tests passed:

- `cargo test --manifest-path musu-rs\Cargo.toml remote_file_token --lib`
  - `3 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml remote_route_token --lib`
  - `3 passed`

Diff whitespace check passed:

- `git diff --check`

Formatting note:

- `rustfmt --edition 2024 --check musu-rs\src\install\cli_commands.rs` reports
  whole-file style differences in pre-existing/import/order and line-wrap
  sections. The current patch intentionally did not run a whole-file rustfmt
  rewrite because it would touch unrelated lines. The targeted Rust tests and
  diff whitespace check are the verification for this scoped fix.

## Product Impact

Positive:

- Aligns remote file CLI auth with route auth.
- Closes the source-level mismatch that made direct route proof pass while
  remote file operations failed with `invalid bearer`.
- Verifies both persisted mesh-bearer and `MUSU_MESH_BEARER` env paths.
- Keeps local bridge token behavior as fallback for local-only/dev cases.

Still not complete:

- The installed rc.22 package still contains the old behavior until MUSU is
  rebuilt, installed on both PCs, and reverified.
- This does not upgrade route transport from `http_bearer` to release-grade
  peer-identity-verified transport.
- This does not close public metadata DNS/TLS, Store, P2P control plane,
  release relay transport, design approval, V34 stale self-heal, Private Mesh
  packaged proof, or second-machine CPU/matrix evidence.

## Next Steps

1. Rebuild and reinstall the MSIX on `hugh_second` and `hugh-main`.
2. From `hugh_second`, rerun the direct route proof to `hugh-main`.
3. From `hugh_second`, run real file-operation proof:
   - `musu ls hugh-main:/`
   - `musu put <small-test-file> hugh-main:/<test-path>`
   - `musu get hugh-main:/<test-path> <local-destination>`
4. Capture the resulting evidence under the multi-device or Private Mesh
   evidence lane, then rerun the go/no-go gate.
5. Only after package-bound evidence is refreshed should the current-packaged
   local evidence documents be treated as current again for this source commit.
