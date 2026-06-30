# Brain Sidecar Autostart Supervision (2026-07-01)

## Verdict

The hidden brain lifecycle blocker is now **source-fixed but not yet
package-proven**.

The previous package evidence refresh proved that the installed
`musu-brain.exe` binary and `~/.musu/brain` root are valid, but also proved a
product gap: the packaged desktop could stay alive while the hidden brain
sidecar was absent. This change closes the source-level observability and
launch-supervision gap. It does **not** close the full-product gate until a new
MSIX is rebuilt, installed, launched cleanly, and recaptured without manually
starting `musu-brain`.

## Product Contract Update

- Hidden brain autostart is now a single guarded operation. Concurrent desktop
  status refreshes cannot start overlapping `musu-brain server` attempts.
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
| HIGH | The lifecycle failure now has durable evidence. | `sidecar-autostart-status.json` records result/stage/detail/pid/log paths. | The next package proof can distinguish missing binary, spawn failure, early exit, timeout, and successful readiness. | Rebuild/reinstall and recapture from a clean desktop launch. |
| HIGH | This is not package evidence yet. | Only source-level tests were run after this change. | The current installed `1.15.0-rc.22` evidence still belongs to the prior code. | Build MSIX, install it, and rerun brain product proof and go/no-go. |
| MED | Long-term supervision is still status-triggered, not a resident monitor loop. | `desktop_status()` calls autostart and launch readiness is recorded. | If the sidecar dies while nobody opens/status-refreshes the cockpit, recovery waits for the next status path. | Package proof should verify clean launch first; a later hardening pass can add an always-on monitor if product usage requires it. |
| LOW | Logs can grow over time. | stdout/stderr append to fixed files under `~/.musu/brain/runtime`. | Long-running installations could accumulate logs. | Add bounded rotation after the lifecycle proof is green. |

## Verification

- `rustfmt --edition 2021 --check musu-bee\src-tauri\src\lib.rs musu-rs\src\install\cli_commands.rs`
  passed.
- `git diff --check` passed.
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml knowledge --lib -j 1 -- --nocapture --test-threads=1`
  passed: 6 tests.
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

## Next Package Proof

1. Rebuild the MSIX from this commit.
2. Install/replace the package on `HUGH_SECOND`.
3. Stop any manually launched `musu-brain` process before opening the desktop.
4. Open the packaged desktop and let it self-start the hidden brain sidecar.
5. Run `musu doctor --json` and confirm:
   - `knowledge.status` is `ok`;
   - `knowledge.autostart_status.result` is `started` or `already_healthy`;
   - `knowledge.autostart_status.readiness_ok` is `true`.
6. Recapture brain product proof without manual sidecar start.
7. Run go/no-go. The brain lifecycle lane is green only if
   `brain_product_verified=true` on a clean package-bound report.
