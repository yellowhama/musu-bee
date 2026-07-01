# Brain Sidecar Retry And Local CPU Refresh (2026-07-01)

## Verdict

This does not make MUSU release-ready.

It fixes and proves one real packaged-desktop lifecycle defect on HUGH_SECOND:
the hidden `musu-brain` sidecar can now recover from the observed
`exited_before_ready` bind race by waiting for an existing healthy sidecar and,
if none appears, retrying the hidden sidecar spawn once.

It also refreshes local packaged evidence on current source commit
`7789f8d3f4c0f823edbbea90f41d60b8771d78ce`.

## Product Spec Update

The MUSU brain integration contract now includes a stronger lifecycle rule:

- `musu-brain` remains a packaged sidecar chip, not rewritten into Rust.
- The product data root remains `~/.musu/brain`, outside MSIX LocalState.
- MUSU owns lifecycle and injects `MUSU_HOME`, `MUSU_KNOWLEDGE_ROOT`, and
  `MUSUBRAIN_ROOT`.
- Hidden autostart must not treat a first `exited_before_ready` child as final
  failure when a competing sidecar may be taking the loopback port.
- If the first hidden child exits before readiness, MUSU now checks whether an
  existing sidecar became healthy; otherwise it retries one spawn and records
  the combined detail in
  `~/.musu/brain/runtime/sidecar-autostart-status.json`.

The local handoff remains `docs/HANDOFF-musu-integration.md`; its upstream
source remains `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`.

## Code Change

Touched source:

- `musu-bee/src-tauri/src/lib.rs`

Implementation:

- factored sidecar process creation into `spawn_knowledge_sidecar_process`
- preserved the existing file lock and product root/env injection
- added one retry path only when the first child exited before readiness
- reused `wait_for_existing_knowledge_sidecar_start` before retrying, so a
  healthy competing sidecar wins instead of spawning another one blindly

## Evidence

Brain product proof:

- `docs/evidence/brain-product/1.15.0-rc.22/20260701-161221-HUGH_SECOND.brain-product-proof.json`
- `docs/evidence/brain-product/1.15.0-rc.22/20260701-161221-HUGH_SECOND.brain-product-verification.json`

Current local packaged baseline:

- `docs/evidence/single-machine/1.15.0-rc.22/20260701-163238-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260701-163238-HUGH_SECOND.verification.json`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260701-163326-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-163336-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-163336-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-163413-HUGH_SECOND.desktop-single-instance.json`

Runtime CPU evidence:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-161658-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-161810-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-161810-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- per-scenario files for `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`
- post-route route evidence:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-161810-HUGH_SECOND.post-route.route-evidence.json`

## Verification

Passed:

- `rustfmt --edition 2021 --check musu-bee\src-tauri\src\lib.rs`
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml knowledge --lib -j 1 -- --nocapture --test-threads=1`
- `scripts\windows\build-msix.ps1 -NoBump`
- `scripts\windows\install-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`
- `scripts\windows\verify-brain-product-proof.ps1` on the 20260701-161221 proof
- `musu doctor --json`: `knowledge.status=ok`, `health_http_status=200`,
  `autostart_status.result=started`
- `scripts\windows\measure-musu-idle-cpu.ps1`: `ok=true`, `git_dirty=false`,
  max observed one-core CPU `0.88%`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` with
  `-AllowFailedPostRouteProbe -ExpectedPostRouteTarget hugh-main`: `ok=true`,
  `fail_count=0`
- refreshed `single-machine`, `process-ownership`,
  `startup-single-instance`, and `desktop-single-instance` packaged evidence

Go/no-go after evidence refresh:

- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `warnings=0`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `brain_product_verified=true`
- `runtime_idle_cpu_valid_machine_count=1` (`HUGH_SECOND`)
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1` (`HUGH_SECOND`)
- `runtime_cpu_scenario_matrix_valid_machine_count=0`

The matrix strict release gate remains open because go/no-go currently requires
a successful post-route probe for the matrix lane. The captured matrix includes
an explicit `hugh-main` route attempt and route metadata, but not a successful
wait-token completion. It is valid for the route-attempt lane, not enough to
close the strict matrix lane.

## Code Audit

| Severity | Issue | Evidence | Impact | Next |
| --- | --- | --- | --- | --- |
| NO-GO | Full product completion is still false. | Go/no-go remains false after current evidence refresh. | Do not claim release readiness. | Close remaining physical/external/product gates. |
| HIGH | Runtime CPU matrix strict gate still needs successful post-route completion. | `runtime_cpu_scenario_matrix_valid_machine_count=0`; route attempt targeted `hugh-main` over LAN but did not complete the wait-token path. | CPU matrix lane remains open even though route-attempt metadata is useful. | Run a successful post-route matrix on the two-PC fleet or adjust gate only with explicit spec approval. |
| HIGH | Store/public metadata remains external-DNS blocked. | `https://musu.pro` verifier still reports DNS/TLS failure kinds. | Store readiness remains blocked independent of local code. | Repair apex DNS/TLS, then rerun public metadata verifier. |
| HIGH | Relay transport is still display/control-plane only. | Design gate still requires real `quic_relay_tunnel` byte transit and payload proof. | Relay cannot be claimed as delegated work route. | Implement/prove real release relay transport. |
| MED | Hidden brain sidecar had an observed bind-race failure mode. | Pre-fix status showed `exited_before_ready` with bind error; post-fix proof shows sidecar healthy. | Fixed locally; needs to stay covered by packaged proof. | Keep brain product proof in the release evidence set. |

## Qualitative Assessment

The local packaged desktop is healthier than before this pass. The brain chip is
packaged, loopback-only, token-gated, rooted under `~/.musu/brain`, and usable
for ingest/recall. The local app process model is also clean: one packaged
bridge runtime, one packaged desktop shell, owned WebView2 helpers, no owned
Node helpers, no repo runtime leakage, and repeated activation/startup reuse
the same bridge/desktop processes.

The main product risk is no longer this PC's local packaged hygiene. The real
constraints are now the two-machine proof set, successful post-route matrix,
public DNS/TLS, Microsoft Store submission, explicit design approval, real
relay byte transport, and V34 stale self-heal evidence.

## Next Steps

1. Run the full runtime CPU scenario matrix with a successful post-route probe
   on the two-PC fleet.
2. Run/import second-PC multi-device and Private Mesh packaged desktop proof.
3. Repair `musu.pro` apex DNS/TLS and rerun public metadata verification.
4. Keep `relay-transport` NO-GO until real relay byte transit and payload
   delivery proof exist.
5. Record explicit design approval and V34 stale self-heal physical evidence.

