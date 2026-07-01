# Local Packaged Evidence Refresh After Shell Cancel Fix (2026-07-01)

This report records the local HUGH_SECOND package/evidence refresh after the
shell task cancel latch fix. It is a package freshness and system-design audit,
not a final release approval.

## Verdict

Full product status remains **NO-GO**.

The shell cancel fix is now rebuilt, installed, and locally proven on
HUGH_SECOND. Local package lanes are green again: MSIX install,
single-machine smoke, process ownership, startup single-instance, desktop
single-instance, desktop-open CPU, and targeted second-PC route-attempt CPU
evidence.

The product is still not complete because the release gate still needs real
second-machine evidence, a successful post-route matrix, public metadata
DNS/TLS proof, Store evidence, P2P control-plane proof, design approval, relay
transport proof, and V34 stale-self-heal proof.

## Package Refresh

- Preflight: `scripts/windows/build-msix.ps1 -NoBump -PreflightOnly` passed.
- Version coherence: Cargo, Tauri, public release metadata, and
  `musu-brain.pin.json` all resolved to `1.15.0-rc.22`.
- Build: `scripts/windows/build-msix.ps1 -NoBump` passed.
- Package: `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`.
- Installed package:
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- Source package proof was captured after commit
  `5c33e57cc495c4b382ae1dc882865739ed0f4543`; later commit
  `0b082dd950c6c7acbc6cfefdcf96ff12a7badd2d` adds docs/evidence only and does
  not change the product binary.

## Evidence

Local package and runtime evidence:

- MSIX install:
  `docs/evidence/msix-install/1.15.0-rc.22/20260701-132112-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-132208-HUGH_SECOND.evidence.json`
- process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-132237-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-132237-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-132237-HUGH_SECOND.desktop-single-instance.json`
- desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-132844-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-133011-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted route-attempt verifier:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-133011-HUGH_SECOND.target-route.verification.json`

Key readings:

- desktop-open CPU evidence: `ok=true`, `git_dirty=false`, `sample_seconds=60.026`,
  operator machine `HUGH_SECOND`.
- scenario matrix: `ok=true`, `git_dirty=false`, five required scenarios
  present, route target `hugh-main`, route probe `ok=false`.
- target-route verifier: `ok=true`, `fail_count=0`, expected target
  `hugh-main`, self/local target rejected, failed route probe allowed only
  because per-attempt metadata and route evidence are present.

## GO/NO-GO Snapshot

Dirty pre-documentation go/no-go:
`.local-build/go-no-go/20260701-134233-after-local-package-cpu-refresh.json`.

- generated at `2026-07-01T13:42:33.0531675+09:00`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `warnings=0`
- `blockers=11`
- blocker areas: `multi-device`, `private-mesh-packaged-release-proof`,
  `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `store-public-metadata`, `store-release`, `p2p-control-plane`, `git`,
  `design-approval`, `relay-transport`, `v34-stale-self-heal`

The `git` blocker is expected before this documentation/evidence commit. After
commit, the expected blocker count should return to the substantive 10 blocker
set unless another evidence freshness rule changes.

Post-commit clean go/no-go:
`.local-build/go-no-go/20260701-134949-after-local-package-cpu-refresh-clean.json`.

- evidence/docs commit: `92f5143a`
- generated at `2026-07-01T13:49:49.4299299+09:00`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `warnings=0`
- `blockers=10`
- blocker areas: `multi-device`, `private-mesh-packaged-release-proof`,
  `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `store-public-metadata`, `store-release`, `p2p-control-plane`,
  `design-approval`, `relay-transport`, `v34-stale-self-heal`

Runtime CPU status:

- `runtime_idle_cpu_valid_machine_count=1/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=0/2`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1`

The matrix valid count is `0/2` because the default matrix verifier requires a
successful post-route probe. The targeted second-PC route-attempt gate is
separate and is locally closed because the failed `hugh-main` route attempt
records the required target, route explain metadata, network probe, and
per-attempt route evidence.

## System Design Audit

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Product is not complete. | go/no-go `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`. | Do not publish or call the product spec complete. | Close the remaining physical/external gates. |
| HIGH | Full runtime CPU matrix still lacks successful post-route proof. | Matrix `route_target=hugh-main`, `route_ok=false`; default verifier candidate fails `post-route route probe`. | The system has target-attempt evidence, but not successful route delivery evidence. | Make `hugh-main` reachable/live, rerun matrix without relying on failed-route allowance. |
| HIGH | Two-machine release evidence remains incomplete. | `runtime_idle_cpu_valid_machine_count=1/2`; `runtime_cpu_scenario_matrix_valid_machine_count=0/2`; `multi-device` blocker remains. | One good local machine does not prove fleet product behavior. | Run/import the current second-PC kit on `hugh-main`. |
| HIGH | External release surfaces remain unproven. | `store-public-metadata`, `store-release`, `p2p-control-plane`, `relay-transport`, `v34-stale-self-heal`, and `design-approval` blockers remain. | Public release and full spec completion are still blocked outside the local package lane. | Repair DNS/TLS, collect Store/design/V34 evidence, implement relay transport proof. |
| INFO | Shell cancel fix is package-proven locally. | MSIX install, single-machine, process/startup/desktop evidence all pass after rebuild. | The source fix is no longer only theoretical on HUGH_SECOND. | Still deploy/prove on `hugh-main` before remote-file proof closure. |

## Product Spec Delta

- Shell task cancellation is now source-fixed and locally package-proven on
  HUGH_SECOND.
- Local package freshness blockers created by the shell cancel source fix are
  closed for HUGH_SECOND.
- The route-attempt CPU gate now has current HEAD evidence for target
  `hugh-main`, but the actual route did not succeed.
- No relay release marker changed. `relay-transport` remains blocked until a
  real relay byte path and transport proof exist.
- Brain integration contracts are unchanged: MUSU product brain root remains
  `~/.musu/brain`; standalone brain defaults and handoff remain in
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`.

## Indexing And Recall

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3698 files` and `3949 symbols`.
- Product brain CLI ingest under `~/.musu/brain` scope `local/musu` ingested
  `6` sources: this report, the roadmap, `WIKI`, `WIKI_INDEX`, `shell.rs`,
  and `runner.rs`.
- `/process` reported `processed: 6`.
- Recall for
  `Local Packaged Evidence Refresh After Shell Cancel Fix 2026 07 01 wiki 1218`
  returned this report as the top result.

## Next Steps

1. Commit this evidence/docs refresh and rerun clean go/no-go.
2. On `hugh-main`, apply/restart the local runtime so the share policy and
   shell cancel fix are present in the installed package, then rerun remote
   file proof from `hugh_second`.
3. Run/import the current second-PC release kit so `multi-device`,
   `runtime-idle-cpu`, and successful `runtime-cpu-scenario-matrix` can close
   with two-machine evidence.
4. Repair `musu.pro` DNS/TLS and rerun public metadata verification.
5. Keep relay runtime, Store, design approval, and V34 stale-self-heal as
   separate release lanes until each has direct proof.
