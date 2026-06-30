# Remote File CLI Physical Proof Policy Blocked (2026-06-30)

## Verdict

MUSU remains **NO-GO** for the full product spec and public desktop release.

The fixed rc.22 package on `HUGH_SECOND` was used for a real sibling-machine
remote file CLI proof attempt against `hugh-main`. The result is useful but not
passing: the previous `invalid bearer` failure did not recur, and the target
bridge instead rejected the request through its file-serving policy.

That means the current blocker is no longer the remote file CLI token source.
The current blocker is target-side file API enablement:

- `hugh-main` has no configured file serve root.
- write proof additionally requires writable sharing.
- `musu share` persists the policy in `~/.musu/shares.toml`.
- this proof package read shares during bridge startup, so the running bridge
  did not expose a newly shared root without policy reload.

Superseding source note: `docs/REMOTE_FILE_CLI_DYNAMIC_SHARE_RELOAD_2026_06_30.md`
removes the remote file API restart requirement for future packages by
reloading file-share policy per request.

## Evidence

Physical proof attempt:

- `docs/evidence/remote-file-cli/1.15.0-rc.22/20260630-212409-HUGH_SECOND-to-hugh-main.remote-file-cli-proof.json`
- schema: `musu.remote_file_cli_physical_proof.v1`
- generated_at: `2026-06-30T21:24:12.7589192+09:00`
- source_node: `hugh_second`
- target_node: `hugh-main`
- remote_dir: `C:\Users\empty\.musu\codex-remote-file-proof`
- source_sha256:
  `dabb3b8a04253ba7bf3dc8576593f7b963cf879db3a025e454017eb71fddcf3d`
- ok: `false`

Observed command results:

| Step | Exit | Result |
|---|---:|---|
| `musu put` | 1 | `forbidden: file writes disabled: set MUSU_FILE_SERVE_WRITABLE=1` |
| `musu ls` | 1 | `forbidden: file API disabled: MUSU_FILE_SERVE_ROOTS not configured` |
| `musu get` | 1 | `forbidden: file API disabled: MUSU_FILE_SERVE_ROOTS not configured` |

## Code Contract

The code audit matches the runtime behavior.

- [musu-rs/src/install/cli_commands.rs](../musu-rs/src/install/cli_commands.rs)
  implements `musu share`, `musu shares`, and `musu unshare` by writing
  `~/.musu/shares.toml`.
- [musu-rs/src/install/shares.rs](../musu-rs/src/install/shares.rs) documents
  the intended policy: remote file API requests reload `shares.toml`, while
  bridge startup still merges roots for watcher/sync setup.
- [musu-rs/src/bridge/config.rs](../musu-rs/src/bridge/config.rs) merges
  `MUSU_FILE_SERVE_ROOTS` plus `shares.toml`, and sets writable mode from
  `MUSU_FILE_SERVE_WRITABLE` or any writable share.
- [musu-rs/src/bridge/handlers/files.rs](../musu-rs/src/bridge/handlers/files.rs)
  fails closed when no file serve root is configured, and separately fails
  closed when write support is disabled.
- Newer source changes `musu share` output to state that remote file API policy
  applies without bridge restart; watcher/sync roots still need restart.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Remote file CLI physical proof is not complete. | `ok=false` proof file above; all `ls/get/put` steps exit 1. | File browsing/download/upload across the two installed PCs cannot be claimed complete yet. | Enable a target share on `hugh-main`, rebuild/reinstall the dynamic-share package or restart the older bridge, rerun proof. |
| INFO | The earlier token bug is not the observed blocker anymore. | Target returned `forbidden`, not `unauthorized: invalid bearer`. | The mesh-bearer source/package fix appears to have moved the flow past auth selection. | Keep token tests, but focus next run on target file policy. |
| HIGH | The product needs an operator-safe proof path for remote file sharing. | Required setup exists as `musu share <PATH> --writable`, but current second-PC proof run did not configure it. Source now removes the remote file API restart requirement for future packages. | Operators can fail the proof even when networking/auth are healthy. | Rebuild/reinstall, add the target-side share step to the second-PC remote-file proof run card, and rerun the proof. |

## Next Execution Procedure

Run this on `hugh-main` before the next `hugh_second` remote file CLI proof:

```powershell
New-Item -ItemType Directory -Force C:\Users\empty\.musu\codex-remote-file-proof
musu share C:\Users\empty\.musu\codex-remote-file-proof --writable --label remote-file-cli-proof
```

With a package that includes the dynamic share reload source fix, a bridge
restart should not be required for the remote file API to reread
`~/.musu/shares.toml`. If `hugh-main` is still running the earlier package used
for this failed proof, rebuild/reinstall first or restart the packaged bridge.

Then rerun from `hugh_second`:

```powershell
musu put .local-build\remote-file-cli-proof\<stamp>\remote-file-cli-proof-<stamp>.txt hugh-main:C:\Users\empty\.musu\codex-remote-file-proof\remote-file-cli-proof-<stamp>.txt
musu ls hugh-main:C:\Users\empty\.musu\codex-remote-file-proof
musu get -o .local-build\remote-file-cli-proof\<stamp>\downloaded-<stamp>.txt hugh-main:C:\Users\empty\.musu\codex-remote-file-proof\remote-file-cli-proof-<stamp>.txt
```

Pass criteria:

- all three commands exit `0`;
- `ls` contains the uploaded filename;
- downloaded SHA256 equals source SHA256;
- the proof is generated by a recorder, not hand-written JSON;
- the resulting file is indexed and cited in the final go/no-go handoff.

## Product Spec Update

Remote file CLI is now split into three separate product claims:

1. **Token source correctness:** fixed in source and locally package-built on
   `HUGH_SECOND`.
2. **Target-side sharing policy:** not yet configured/proven on `hugh-main`.
3. **Release-grade transport identity:** still not complete because the direct
   route remains LAN HTTP bearer with `peer_identity_verified=false`.

Only the first claim is currently supported by package-bound evidence. The full
remote file workflow remains open until the second and third claims are proven
or explicitly scoped out of the release claim.
