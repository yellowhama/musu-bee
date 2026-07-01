# Brain Sidecar Autostart Supervision (2026-07-01)

## Verdict

The hidden brain lifecycle blocker is now **source-fixed and locally
package-proven for the hidden-brain lane on `HUGH_SECOND`**.

The previous package evidence refresh proved that the installed
`musu-brain.exe` binary and `~/.musu/brain` root are valid, but also proved a
product gap: the packaged desktop could stay alive while the hidden brain
sidecar was absent. The first source fix added durable autostart status, but
the rebuilt package then exposed a second failure: desktop launch could race
over `127.0.0.1:8080` and leave `musu-brain` exited before readiness. The final
source fix adds a cross-process start lock under `~/.musu/brain/runtime`, and
the rebuilt local-sideload package now starts the hidden sidecar without a
manual `musu-brain server` start.

This closes the local hidden-brain lifecycle lane. It does **not** close the
full-product gate: the current source revision still needs the non-brain local
freshness lanes recaptured after commit, and public release remains blocked by
two-machine, Store/public metadata, P2P/relay, Private Mesh, design, and V34
proof.

## Product Contract Update

- Hidden brain autostart is now a single guarded operation. Concurrent desktop
  status refreshes cannot start overlapping `musu-brain server` attempts.
- The guard is both in-process and cross-process. The cross-process lock is
  `~/.musu/brain/runtime/sidecar-start.lock`, with stale lock recovery after
  30 seconds. This prevents multiple packaged launch/status paths from racing
  on the same loopback sidecar port before health is reachable.
- The product writes launch evidence under the MUSU product root, not MSIX
  `LocalState`:
  `~/.musu/brain/runtime/sidecar-autostart-status.json`.
- The status schema is `musu.knowledge_sidecar_autostart.v1`.
- Sidecar stdout/stderr are persisted next to the status file:
  `~/.musu/brain/runtime/sidecar-stdout.log` and
  `~/.musu/brain/runtime/sidecar-stderr.log`.
- Readiness is bounded: after spawn, the desktop polls
  `http://127.0.0.1:8080/health` for up to 10 seconds with capped backoff.
- `musu doctor --json` now exposes:
  - `knowledge.autostart_status_path`
  - `knowledge.autostart_status`
  - `knowledge.autostart_status_error`
- Token material remains separate. The status JSON never stores
  `musu-ingest.token` contents.

## Code Changes

- `musu-bee/src-tauri/src/lib.rs`
  - added a brain-side `RuntimeStartGate`;
  - added a cross-process `sidecar-start.lock` guard under
    `~/.musu/brain/runtime`;
  - replaced fire-and-forget brain spawn with guarded autostart;
  - records command, product root, address, health URL, pid, readiness result,
    elapsed time, and log paths;
  - captures early exit, spawn failure, readiness timeout, already-healthy, and
    start-in-progress states;
  - keeps all brain runtime state under `~/.musu/brain/runtime`.
- `musu-rs/src/install/cli_commands.rs`
  - reads the autostart status JSON in `musu doctor --json`;
  - reports parse/read errors without failing the whole doctor command.

## Audit

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| HIGH | The local hidden-brain lifecycle lane is now package-proven. | `docs/evidence/brain-product/1.15.0-rc.22/20260701-085057-HUGH_SECOND.brain-product-verification.json` has `ok=true`, `fail_count=0`, sidecar process observed, loopback health OK, task ingest/process/query OK, and capture ingest/process/query OK. | The product now proves the user-invisible motherboard+chip path on this PC without a manual sidecar start. | Keep this proof fresh after any source/package change; recapture non-brain local lanes after commit. |
| HIGH | The prior package failure was a cross-process bind race, not a bad brain binary/root. | Before the lock, package launch wrote `exited_before_ready` with `listen tcp 127.0.0.1:8080: bind`; manual packaged `musu-brain server -root ~/.musu/brain -addr 127.0.0.1:8080` stayed healthy. After the lock, status records `result=started`, `readiness_ok=true`, pid `33428`. | A per-process gate was insufficient for packaged launch trees. | Keep the file lock contract and test in source; later add log rotation. |
| MED | Long-term supervision is still status-triggered, not a resident monitor loop. | `desktop_status()` calls autostart and launch readiness is recorded. | If the sidecar dies while nobody opens/status-refreshes the cockpit, recovery waits for the next status path. | Package proof should verify clean launch first; a later hardening pass can add an always-on monitor if product usage requires it. |
| LOW | Logs can grow over time. | stdout/stderr append to fixed files under `~/.musu/brain/runtime`. | Long-running installations could accumulate logs. | Add bounded rotation after the lifecycle proof is green. |

## Verification

- `rustfmt --edition 2021 --check musu-bee\src-tauri\src\lib.rs musu-rs\src\install\cli_commands.rs`
  passed.
- `git diff --check` passed.
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml knowledge --lib -j 1 -- --nocapture --test-threads=1`
  passed: 7 tests, including
  `knowledge_start_file_lock_blocks_reentry_until_guard_drop`.
- `cargo test --manifest-path musu-rs\Cargo.toml knowledge_sidecar_autostart_status_reader --lib -j 1 -- --nocapture --test-threads=1`
  passed: 1 test.
- `cargo test --manifest-path musu-rs\Cargo.toml doctor_next_steps_include_hidden_brain_sidecar_warning --lib -j 1 -- --nocapture --test-threads=1`
  passed: 1 test.
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml doctor_status_summary_flags_alias_shadowing_and_local_only_mode --lib -j 1 -- --nocapture --test-threads=1`
  passed: 1 test.
- Code/docs indexing:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3627 files` and `3938 symbols`.
- Product brain CLI ingest under `local/musu` created 8 sources and processed
  8: this report, the current package evidence report, the full-product
  roadmap, the brain root contract, `docs/WIKI.md`, `docs/WIKI_INDEX.md`,
  `musu-bee/src-tauri/src/lib.rs`, and
  `musu-rs/src/install/cli_commands.rs`.
- Product brain recall for
  `BRAIN_SIDECAR_AUTOSTART_SUPERVISION_2026_07_01` returned the new report
  source.
- Clean go/no-go after this source change:
  `.local-build/go-no-go/after-brain-autostart-supervision-20260701.json`,
  reported `manifest_git.dirty=false`, `warnings=0`, `blockers=16`,
  `ready_for_public_desktop_release=false`, `full_product_spec_ready=false`,
  and `brain_product_verified=false`. Current package-bound CPU/matrix counts
  are `0` for this source revision because the
  source change has not been rebuilt/reinstalled and recaptured.

## Package Proof Result

After adding the cross-process start lock:

- Rebuilt MSIX with
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 -NoBump`.
- Reinstalled the local-sideload package with
  `scripts\windows\install-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`.
- Strict MSIX install evidence:
  `docs/evidence/msix-install/1.15.0-rc.22/20260701-085145-HUGH_SECOND.evidence.json`,
  verifier `ok=true`, `brain_full_trust_process=true`, `alias_shadowing_mode=fail`.
- Packaged desktop launch wrote:
  `~/.musu/brain/runtime/sidecar-autostart-status.json` with
  `result=started`, `readiness_ok=true`, pid `33428`, and
  `detail="Hidden brain sidecar became healthy after spawn."`.
- `musu doctor --json` reported `knowledge.status=ok`,
  `knowledge.health_http_status=200`, and the same autostart status object.
- Brain product proof:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-085057-HUGH_SECOND.brain-product-proof.json`;
  verification:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-085057-HUGH_SECOND.brain-product-verification.json`;
  verifier `ok=true`, `fail_count=0`.
- Dirty go/no-go at `2026-07-01T08:54:57+09:00` correctly reports
  `brain_product_verified=true` and `msix_install_verified=true`, while still
  reporting source-dirty and stale non-brain local freshness lanes. A final
  clean go/no-go must be regenerated after this documentation/evidence commit.

## Residual Next Steps

1. Regenerate final clean go/no-go after this documentation/evidence commit.
2. Recapture non-brain local package freshness lanes for the new source
   revision if this commit becomes the release candidate: single-machine,
   process ownership, startup single-instance, desktop single-instance,
   desktop-open idle CPU, and runtime CPU scenario matrix.
3. Refresh the hosted `musu.pro` package channel before installing this exact
   build on `hugh-main`.
4. Add bounded sidecar log rotation after the lifecycle lane stays green.
5. Keep the full product marked NO-GO until the remaining two-machine,
   public metadata, Store, P2P/relay, Private Mesh, V34, and design-approval
   blockers are closed.
