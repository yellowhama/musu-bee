# MUSU 1.15.0-rc.1 Final Operator Packet After Subrole Gate

Date: 2026-06-06 KST
Status: Done with concerns. The operator handoff artifacts are current and
verified after the second-PC runtime CPU subrole import gate. Public desktop
release is still No-Go on external and second-machine gates.

## Summary

After commit `a45e6a1b75a51cba4276cdf60a452041069fd6c3`, the final operator
packet and operator action pack were regenerated from a clean tree. The nested
second-PC transfer kit now carries the release-check wrapper/import contract
that requires current runtime CPU subrole evidence:

- `runtime_cpu_subrole_contract_ok=true`
- `runtime_idle_cpu_subrole_summary`
- `runtime_cpu_scenario_subrole_summary`
- idle CPU and runtime matrix JSON fields for `process_counts_by_subrole`,
  `max_one_core_percent_by_subrole`, `memory_totals_by_subrole_mb`, and
  `cpu_attribution.top_processes[*].process_subrole`
- required `bridge_runtime`, `desktop_shell`, and `webview2_helper` evidence
  where applicable

Older second-PC return archives remain diagnostic only and cannot close
`import-second-pc-return.ps1 -RequireReleaseGateEvidence`.

## Artifacts

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-020415.zip`
- final operator latest alias:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432.zip`
- operator action latest alias:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-020432.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\partner-center\MUSU-1.15.0-rc.1-store-submission-20260606-020432.zip`
- support mailbox: `musu@musu.pro`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260606-020415`

## Validation

- `prepare-final-operator-gate-packet.ps1 -Json`: `ok=true`
- `verify-final-operator-gate-packet.ps1 -Json`: `ok=true`,
  `fail_count=0`, `kit_count=1`
- `prepare-operator-action-pack.ps1 -Json`: `ok=true`
- `verify-operator-action-pack.ps1 -Json`: `ok=true`, `fail_count=0`
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` from clean
  HEAD:
  - `ready_for_public_desktop_release=false`
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `msix_install_verified=true`
  - `public_metadata_ok=true`
  - `manifest_git.dirty=false`
  - `multi_device_verified=false`
  - `p2p_control_plane_verified=false`
  - `support_mailbox_verified=false`
  - `store_release_verified=false`
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=45`, `failed_case_count=0`

The go/no-go result still has six public-release blockers: second-PC
multi-device evidence, second-PC idle CPU evidence, second-PC runtime CPU
matrix evidence, live hosted `musu.pro` P2P control-plane proof, support
mailbox verification, and Partner Center/Store evidence.

## Product Spec Impact

The product boundary is unchanged and should stay explicit in operator-facing
docs:

- MUSU Desktop is the local executor on each Windows device.
- The local program can receive authenticated web/peer work orders, but work
  runs on that local device.
- `localhost:3001` is optional developer/workspace dashboard surface, not the
  required installed-product surface.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control coordination.
- MUSU.PRO must not become the default execution server or default payload data
  path.
- The second Windows PC must install and run the current MUSU build before
  multi-device route, CPU, matrix, and P2P mesh claims can be closed.

## Code Audit

No new source code changed in this artifact-refresh pass. Audit scope was the
current HEAD after `a45e6a1b`, especially the second-PC import gate and the
operator packet/action-pack verifiers.

No open high or medium issue was found in the current path. The important
medium issue from the prior pass was already fixed in `a45e6a1b`: the release
import path no longer trusts returned release-check booleans alone and now
re-parses returned CPU JSONs directly for the subrole contract.

Residual risks are operational, not hidden local-code blockers:

- no real current second-PC return has been imported yet
- hosted P2P proof is not release-complete
- release relay payload transport is still not wired as release-grade
- support mailbox and Store evidence are still external gates

## Qualitative Assessment

The local desktop product is coherent for one-machine testing: the packaged
runtime, desktop shell, local bridge, and evidence tools now separate local
execution from optional dashboard/web coordination. The artifact handoff is
also in better shape because the person running the second PC receives one
current transfer zip and a quickstart that names the exact CPU subrole contract
the importer will enforce.

Public release is still not ready. The strongest current signal is that the
local executor path is stable and the evidence gate fails closed. The weakest
area is still outside this computer: another Windows PC must run the same kit,
and MUSU.PRO must produce owner-scoped live P2P/relay proof instead of only
source-level or one-machine evidence.

## Code And Document Indexing

MUSU local indexing was refreshed after this report, WIKI, GOAL, spec, BETA
checklist, and CoS memory updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2469`
- symbols: `2717`
- elapsed: `18185 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current code/document index for this
Windows machine.

## Next Steps

1. Copy the current second-PC transfer zip to the second Windows PC.
2. Install/run the same current MUSU build there.
3. Run `run-second-pc-release-check.ps1` without skipping runtime idle CPU or
   runtime CPU scenario matrix.
4. Bring back `.local-build\second-pc-return\*.zip` and import it with
   `import-second-pc-return.ps1 -RequireReleaseGateEvidence`.
5. Run the actual two-machine route proof and record multi-device evidence.
6. Configure live hosted MUSU.PRO P2P storage/auth and capture owner-scoped
   release-grade route/relay/payload proof.
7. Verify `musu@musu.pro` mailbox delivery.
8. Record Partner Center product reservation, Store submission, certification,
   and restricted capability approval evidence.
