# Remote File Share And Shell Cancel Audit (2026-07-01)

## Scope

This audit continued the full-product closeout from clean branch
`feat/v33-residual-finalize` at
`92e947c2b4c982e773c7cb4f2c6c0e15b0316823`.

Target system:

- source PC: `hugh_second`
- target PC: `hugh-main`
- installed package on both machines: `1.15.0-rc.22` / MSIX
  `1.15.0.22`
- target bridge URL: `http://192.168.1.192:4387`

The main question was whether the current second-PC blocker could be narrowed
by enabling the documented remote file proof root on `hugh-main`, then using
`musu put` / `musu ls` / `musu get` to move proof files without a separate
operator file-transfer step.

## Evidence Collected

Direct route health was already known-good and was reconfirmed during this
turn:

- `musu route -t hugh-main --adapter shell --wait "hostname"` initially
  completed and returned `hugh-main`.
- `musu route -t hugh-main --adapter shell --wait "whoami"` initially
  completed and returned `hugh-main\empty`.
- `where musu` on the target resolved both the packaged WindowsApps path and
  execution alias.

The target share registration command then completed over the explicit shell
adapter:

```powershell
if not exist C:\Users\empty\.musu\codex-remote-file-proof mkdir C:\Users\empty\.musu\codex-remote-file-proof && musu share C:\Users\empty\.musu\codex-remote-file-proof --writable --label remote-file-cli-proof
```

The target output was:

```text
Shared: \\?\C:\Users\empty\.musu\codex-remote-file-proof
Mode: read/write
Restart bridge to apply: musu bridge
```

After that, local fleet status reported the target share directory:

```json
"shared_dirs": [
  "\\\\?\\C:\\Users\\empty\\.musu\\codex-remote-file-proof"
]
```

But the actual remote file API was still disabled:

```text
Error: failed: {"error":"forbidden: file API disabled: MUSU_FILE_SERVE_ROOTS not configured","code":"forbidden"}
```

This means the target policy write succeeded, but the installed target bridge
did not apply the share to live file API handling before a bridge restart.

## Code Audit Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| HIGH | Installed target package still behaves as if `musu share` requires a bridge restart for remote file API. | Target output says `Restart bridge to apply`; live `musu ls hugh-main:C:\Users\empty\.musu\codex-remote-file-proof` still returns `MUSU_FILE_SERVE_ROOTS not configured`. Current source says `Remote file API: applies without bridge restart` in `musu-rs/src/install/cli_commands.rs:1008`, and file handlers rebuild policy from `shares.toml` in `musu-rs/src/bridge/handlers/files.rs:150`. | The source contract and installed rc.22 behavior are split. Remote file proof cannot be completed until `hugh-main` bridge restarts or a newer package containing dynamic share apply is installed there. | On `hugh-main`, run a local bridge restart, then rerun file proof. Keep go/no-go as NO-GO until proof is captured from the actual installed package. |
| HIGH | Shell adapter can leave an unkillable-looking running task when a command spawns a background child that inherits stdout. | A remote `start /B powershell ...` restart attempt left task `9dba3497-c80c-417a-8e59-dcb4a2d869ea` in `running`. Direct `DELETE /api/tasks/9dba...` returned `cancelled=true`, but `GET /api/tasks/9dba...` still returned `status=running`. | The cancel endpoint can acknowledge cancellation without forcing the task into a terminal observable state. This is an operations/reliability issue for remote shell and should not be used as a release-grade self-restart path. | Add a product fix: cancellation must kill the process tree or report `cancel_signal_delivered_but_still_running`; bridge startup should orphan/reap stale running shell rows. |
| MED | The bridge lacks a safe remote lifecycle endpoint for restarting itself after share policy changes. | Rust bridge routes include `/api/system/update`, not `/api/system/restart`; the documented API reference is broader than the current Rust route table. | Operators are tempted to use shell to restart the same bridge that is executing the shell task, which is fragile and caused the stuck task above. | Add a supervised lifecycle command outside the task runner, or require explicit local operator restart in the runbook. |
| INFO | The remote API auth path is correct. | Direct HTTP to `http://192.168.1.192:4387/api/tasks` succeeded only with the account-wide mesh bearer from local `~/.musu/mesh.env`; no token value was printed. | The previous remote file auth source bug is not the current blocker. | Keep mesh bearer as the sibling-machine credential; do not revert to local bridge-token auth for cross-machine file/task APIs. |

## Current Product Meaning

This narrows the blocker but does not close it.

Known-good:

- `hugh-main` is reachable over direct fleet routing.
- The target directory exists.
- The target share root is registered and visible in fleet status.
- Cross-machine bearer auth is working.

Still not done:

- `musu ls` / `musu put` / `musu get` proof is not complete.
- The target installed bridge has not applied the share policy to file API
  handlers.
- `hugh-main` has a stuck remote shell task row from the attempted remote
  restart path.
- This does not close the release blockers for multi-device, runtime CPU
  second-PC evidence, Private Mesh packaged release proof, V34 stale self-heal,
  public metadata, Store release, P2P control-plane, relay transport, or design
  approval.

## Required Next Step

On `hugh-main`, use a local terminal or desktop-controlled operator path, not
remote shell, to restart the packaged bridge:

```powershell
musu down --json --timeout-sec 5
musu up --json --timeout-sec 30
```

Then from `hugh_second` rerun:

```powershell
musu ls hugh-main:C:\Users\empty\.musu\codex-remote-file-proof
```

If the list succeeds, run the three-command remote file physical proof:

```powershell
musu put <local-proof-file> hugh-main:C:\Users\empty\.musu\codex-remote-file-proof\<proof-file>
musu ls hugh-main:C:\Users\empty\.musu\codex-remote-file-proof
musu get -o <downloaded-proof-file> hugh-main:C:\Users\empty\.musu\codex-remote-file-proof\<proof-file>
```

Finally compare SHA256 between local and downloaded files, import or record the
evidence, rerun go/no-go, and keep the full product status as NO-GO unless all
release gates pass.

## Confidence

High confidence:

- The root cause of the failed file proof is not network reachability or auth.
  It is live file policy application on the target bridge.
- Remote shell is unsafe as a bridge self-restart mechanism in the current
  installed package.

Medium confidence:

- A local `musu down` / `musu up` on `hugh-main` should apply the registered
  share root and clear the stuck runner state, because bridge startup rebuilds
  file policy and task runner startup already treats bridge restarts as the
  cleanup boundary.

Unknown until rerun:

- Whether the installed `hugh-main` package after restart can complete the
  remote file write/read proof without additional file API policy gaps.

## Indexing And Recall

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3676 files` and `3947 symbols`.
- Product brain CLI ingest under product root `~/.musu/brain` and scope
  `local/musu` ingested `4` sources:
  this report, the full-product roadmap, `docs/WIKI.md`, and
  `docs/WIKI_INDEX.md`.
- `musu-brain process -root ~/.musu/brain -tenant local -workspace musu`
  reported `processed: 4`.
- Recall query
  `wiki/1216 remote file share shell cancel MUSU_FILE_SERVE_ROOTS 9dba3497`
  returned the new remote-file/share audit report as the top result.
