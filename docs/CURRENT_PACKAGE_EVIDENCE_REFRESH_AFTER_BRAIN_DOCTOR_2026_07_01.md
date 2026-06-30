# Current Package Evidence Refresh After Brain Doctor (2026-07-01)

## Verdict

MUSU remains **NO-GO** against the full product spec.

The `aedb6ade` brain doctor/status source change was rebuilt, installed, and
recaptured on `HUGH_SECOND`. Local package evidence is healthy for MSIX install,
single-machine smoke, process ownership, startup/desktop single-instance,
desktop-open idle CPU, and the five-scenario runtime CPU matrix. The targeted
`hugh-main` route attempt also succeeds.

The new audit found one product-relevant regression: the packaged desktop can be
alive while the hidden `musu-brain` sidecar is not running. A fresh brain product
proof at `20260701-071746` failed with `fail_count=14` because no sidecar process
or `/health` response was observed. Manually starting the same packaged
`musu-brain.exe server -root ~/.musu/brain -addr 127.0.0.1:8080` made `/health`
return OK, so the binary/root are valid; the gap is lifecycle supervision, not
the Go chip itself.

## Evidence

- MSIX install:
  `docs/evidence/msix-install/1.15.0-rc.22/20260701-070010-HUGH_SECOND.evidence.json`
- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-070056-HUGH_SECOND.evidence.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-070115-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-070138-HUGH_SECOND.startup-single-instance.json`
- Desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-070544-HUGH_SECOND.desktop-single-instance.json`
- Desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-070556-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-070713-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-070713-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- Target-route verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-070713-HUGH_SECOND.target-route.verification.json`
- Brain product proof failure:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-071746-HUGH_SECOND.brain-product-proof.json`
- Brain product failure verification:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-071746-HUGH_SECOND.brain-product-verification.json`

## Audit

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Hidden brain lifecycle is not proven for the rebuilt package. | `20260701-071746` brain proof has `ok=false`, no sidecar process, no health, and `fail_count=14`. | The product cannot claim the user-invisible motherboard+chip experience is complete. | Add sidecar launch logging/readiness, restart/supervision evidence, and recapture brain product proof without manual server start. |
| HIGH | Targeted route succeeds, but transport is not release-grade. | `20260701-070713` route explain selects LAN `192.168.1.192:4387` with `current_transport=http_bearer`, `encryption=none_http_bearer`, `peer_identity_verified=false`, and `route_evidence_ready=false`. | This proves direct targetability, not release-grade relay/identity transport. | Keep relay/QUIC/TLS and route evidence blockers open. |
| HIGH | Runtime CPU evidence is only valid for `HUGH_SECOND`. | Matrix and idle CPU verifiers pass for one machine only. | Public desktop release still needs required machine count. | Run/import second-PC CPU/matrix evidence. |
| MED | Sidecar spawn failures are hard to diagnose. | `spawn_knowledge_sidecar_autostart()` discards stdout/stderr and does not record a persistent readiness result after spawn. | Failures can look like a user/config problem instead of a lifecycle bug. | Persist sidecar spawn attempt status in product logs and surface it through doctor/cockpit. |

## Source Follow-Up

This report found the hidden brain lifecycle failure. The source-level follow-up
is documented in `docs/BRAIN_SIDECAR_AUTOSTART_SUPERVISION_2026_07_01.md`.

That follow-up adds guarded brain autostart, persistent launch status under
`~/.musu/brain/runtime/sidecar-autostart-status.json`, stdout/stderr logs under
the same runtime directory, bounded `/health` readiness probing, and
`musu doctor --json` fields for `knowledge.autostart_status_path`,
`knowledge.autostart_status`, and `knowledge.autostart_status_error`.

This does not change the verdict of this package report: the installed package
evidence here remains NO-GO for brain lifecycle until the source follow-up is
rebuilt into a new MSIX and recaptured without manually starting `musu-brain`.

## Verification

- `build-msix.ps1 -NoBump -PreflightOnly` passed version coherence including
  `musu-brain.pin.json`.
- `build-msix.ps1 -NoBump` produced and signed the local sideload MSIX.
- `install-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`
  installed `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- Runtime CPU matrix verifier passed with `ok=true`, `fail_count=0`.
- Target-route verifier passed with `ok=true`, `fail_count=0`.
- Brain product verifier failed with `ok=false`, `fail_count=14`.
- Code/docs indexing:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3626 files` and `3920 symbols`.
- Product brain CLI ingest under `local/musu` processed 5 sources:
  this report, the full-product roadmap, the brain root contract,
  `musu-bee/src-tauri/src/lib.rs`, and
  `musu-rs/src/install/cli_commands.rs`.
- Product brain recall check for
  `CURRENT_PACKAGE_EVIDENCE_REFRESH_AFTER_BRAIN_DOCTOR src_8a1a6ad9 hidden brain lifecycle NO-GO`
  returned the new report source
  `wiki/sources/src_8a1a6ad9cb5024ce.md`.
- Clean go/no-go after this report commit:
  `.local-build/go-no-go/after-brain-lifecycle-audit-20260701.json`,
  generated `2026-07-01T07:30:46.4115150+09:00`, commit `27152fa0`,
  `manifest_git.dirty=false`, `warnings=0`, `blockers=11`,
  `single_machine_verified=true`, `process_ownership_verified=true`,
  `startup_single_instance_verified=true`,
  `desktop_single_instance_verified=true`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `runtime_idle_cpu_valid_machine_count=1`,
  `runtime_cpu_scenario_matrix_valid_machine_count=1`,
  and `brain_product_verified=false`.

## Next Steps

1. Treat hidden brain lifecycle as the next local blocker: the desktop must
   prove it can start or restart `musu-brain` without a manual server command.
2. Rebuild/reinstall the source follow-up from
   `docs/BRAIN_SIDECAR_AUTOSTART_SUPERVISION_2026_07_01.md`.
3. Recapture brain product proof from a clean packaged desktop launch with no
   manually started `musu-brain` process, and inspect
   `knowledge.autostart_status` if it fails.
4. Continue the existing release blockers: second-PC CPU/matrix, Private Mesh,
   P2P/relay transport, Store/public metadata, Store release, design approval,
   and V34 stale self-heal evidence.
