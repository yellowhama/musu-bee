# Runtime CPU Post-Route Self-Target Fix (2026-07-01)

## Summary

The `runtime-cpu-scenario-matrix` lane remains NO-GO, but the current
post-route failure has been narrowed and a source bug was fixed.

Live evidence showed that `hugh_second` could reach `hugh-main` over LAN and
queue delegated tasks, but `musu route --target hugh-main --wait` timed out
waiting for completion. A direct retry with `--adapter echo` also timed out,
so the blocker was not the default AI adapter. Remote task status on
`hugh-main` showed stale `running`/`pending` CLI tasks.

## Root Cause

`musu-rs/src/bridge/router.rs` treated every explicit target as a peer lookup
before checking whether the explicit target was this node's own `node_name`.
If a node has a stale self row in peer discovery, receiving
`target_node=<self-node-name>` can choose a remote peer path instead of local
execution. That leaves the source `route_executions` row pending while the
route wait loop eventually records `remote_task_wait_timeout`.

This is especially visible in the runtime CPU matrix post-route probe because
the probe sends a target-bound route and requires a completed wait token.

## Fix

- `musu-rs/src/bridge/router.rs`
  - Added an explicit self-target guard before peer lookup.
  - If `explicit_target == state.config.node_name`, the bridge now returns
    `RouteDecision::Local`.
  - The self-target comparison trims leading/trailing whitespace before
    matching.
  - Added a unit test:
    `explicit_target_matching_local_node_stays_local_before_peer_cache`.

- `scripts/windows/measure-musu-runtime-cpu-scenarios.ps1`
  - Added `-RouteAdapter`, defaulting to `echo`.
  - The post-route probe now invokes `musu route --adapter echo ...`.
  - The route probe evidence now records `route_adapter`.

- `scripts/windows/test-release-evidence-verifiers.ps1`
  - Locked the runtime CPU matrix source contract so the deterministic `echo`
    adapter and `route_adapter` evidence field cannot silently disappear.

## Verification

- PowerShell parser checks passed for:
  - `scripts/windows/measure-musu-runtime-cpu-scenarios.ps1`
  - `scripts/windows/test-release-evidence-verifiers.ps1`
- Release evidence verifier regression passed:
  - schema: `musu.release_evidence_verifier_regression.v1`
  - output root:
    `.local-build/release-evidence-verifier-tests/20260701-173445`
  - `ok=true`
  - `case_count=220`
  - `failed_case_count=0`
- Rust targeted tests passed:
  - `cargo test --manifest-path musu-rs/Cargo.toml --lib bridge::router -j 1 -- --nocapture --test-threads=1`
    passed `7/7`.
  - `cargo test --manifest-path musu-rs/Cargo.toml --bin musu bridge::router -j 1 -- --nocapture --test-threads=1`
    passed `7/7`.
- The broader `cargo test --manifest-path musu-rs/Cargo.toml bridge::router ...`
  also passed the router tests in lib/bin, but the run ended with Windows
  `os error 740` when a filtered integration-test binary required elevation.
  The scoped lib/bin commands above are the authoritative verifier for this
  change.
- Dirty go/no-go at `2026-07-01T17:28:07.6821307+09:00` reported
  `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
  `blocker_count=11`, `warnings=0`, and `manifest_dirty=true`. The extra
  blocker is the expected `git` blocker while this source/docs update is
  uncommitted.
- First clean go/no-go after source commit `a0b115a0` at
  `2026-07-01T17:52:22.441498+09:00` reported
  `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
  `blockers=15`, `warnings=0`, and `manifest_git.dirty=false`. This is expected:
  the source fix makes prior package-bound evidence stale until the package is
  rebuilt/reinstalled and the local/runtime proof lanes are recaptured.

## Indexing

- Final `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3731 files` and `3952 symbols` in `85846 ms`.
- Product brain ingest/process under `local/musu` processed the seven final
  changed code/docs sources: this report, the roadmap, `docs/WIKI.md`,
  `docs/WIKI_INDEX.md`, `router.rs`, and the two runtime CPU scripts. Output:
  `processed: 7`.
- After this indexing note, a final docs-only refresh ingested this report, the
  roadmap, `docs/WIKI.md`, and `docs/WIKI_INDEX.md` again. Output:
  `processed: 4`.
- Recall query:
  `wiki/1226 runtime CPU post-route self-target explicit_target_matches_local_node RouteAdapter echo remote_task_wait_timeout`
  returned the canonical report in the top results, along with the updated
  runtime CPU script source. Exact source ids are not part of the contract.

## Live Diagnostic Notes

Before this source fix is packaged and installed on `hugh-main`, live route
probes are still expected to use the old packaged router behavior.

Observed live diagnostics:

- `musu route --target hugh-main --adapter echo --wait-timeout-sec 30 --wait`
  queued task `45dd75ba-4684-410b-9054-a4ce9182a4bc` and timed out with
  `remote_task_wait_timeout`.
- `hugh-main` task status showed stale CLI tasks. The following stale route
  probe task rows were cancelled through the remote bridge API:
  `45dd75ba-4684-410b-9054-a4ce9182a4bc`,
  `c509c314-7289-4e00-af33-83e0e0ac0a5d`, and
  `1b7c854b-15ee-4d10-989d-055860c3ac20`.
- One older running task,
  `9dba3497-c80c-417a-8e59-dcb4a2d869ea`, still reported `running` after a
  cancel request. Treat this as stale remote runtime state until the
  `hugh-main` bridge is restarted or a stale-task cleanup proof is recorded.

## Product Meaning

This is a source-level correctness fix for target-bound delegated execution.
It does not close the full runtime CPU matrix lane yet.

Closure still requires:

1. Rebuild/reinstall the current package on both physical PCs.
2. Ensure `hugh-main` has no stale running task rows or restart its packaged
   bridge before proof capture.
3. Rerun the runtime CPU matrix with a target-bound post-route probe.
4. Commit verifier-passing evidence under
   `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/`.
5. Rerun `write-release-go-no-go.ps1 -Json` on a clean commit.

The product remains NO-GO until the canonical go/no-go lane reports
`runtime_cpu_scenario_matrix_valid_machine_count >= 2` and the other external
blockers close.
