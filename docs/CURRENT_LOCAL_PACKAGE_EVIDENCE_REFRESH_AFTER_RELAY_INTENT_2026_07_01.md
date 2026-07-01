# Current Local Package Evidence Refresh After Relay Intent Gate (2026-07-01)

## Summary

This refresh rebuilds the current `1.15.0-rc.22` local sideload package after
the relay release-tunnel intent opt-in source change and recaptures the
package-bound local evidence on `HUGH_SECOND`.

Result: local packaged evidence is healthy on this PC, but the product remains
NO-GO. The remaining blockers are not local package startup or idle CPU defects;
they are two-machine, Store/public metadata, Private Mesh packaged proof,
release-grade P2P/relay transport, design approval, and V34 stale self-heal
gates.

## Evidence

- MSIX install:
  `docs/evidence/msix-install/1.15.0-rc.22/20260701-051853-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-051917-HUGH_SECOND.evidence.json`
- process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-051924-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-051937-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-051957-HUGH_SECOND.desktop-single-instance.json`
- desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-053248-HUGH_SECOND.desktop-open.evidence.json`
- brain product proof:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-054634-HUGH_SECOND.brain-product-proof.json`
- runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-052025-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU target-route verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-052025-HUGH_SECOND.target-route.verification.json`

## Verification

- `build-msix.ps1 -NoBump` produced
  `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`.
- `install-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`
  installed `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- `capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual`
  passed and confirms `musu-brain.exe` is installed and declared as an MSIX
  fullTrust process.
- `smoke-single-machine-beta.ps1` passed on the packaged bridge
  `http://127.0.0.1:1863`.
- `audit-musu-process-ownership.ps1` passed: packaged runtime `1`, packaged
  desktop shell `1`, owned Node helpers `0`, owned WebView2 helpers `6`.
- `audit-musu-startup-single-instance.ps1` passed: three startup invocations
  reused bridge PID `33160`.
- `audit-musu-desktop-single-instance.ps1` passed with `git_dirty=false`: three
  desktop activations left exactly one desktop shell.
- `measure-musu-idle-cpu.ps1` passed with `git_dirty=false`: 60.027s
  `desktop-open` sample, MUSU process count `2`, owned WebView2 `6`, hottest
  owned process `0.73%` of one logical CPU, bridge `0.05%`.
- `record-brain-product-proof.ps1` passed for the current installed package:
  brain proof `20260701-054634`, `fail_count=0`, root
  `C:\Users\empty\.musu\brain`, loopback `http://127.0.0.1:8080`.
- `measure-musu-runtime-cpu-scenarios.ps1` passed with `git_dirty=false` for
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`.
- `verify-runtime-cpu-scenario-matrix.ps1` passed for both the general matrix
  and the targeted `hugh-main` route attempt.

Dirty pre-final `write-release-go-no-go.ps1 -Json` at
`2026-07-01T05:35:50.3641264+09:00` read the new evidence and reported:

- `ready_for_public_desktop_release=false`
- `full_product_spec_ready=false`
- `manifest_git.dirty=true`
- `blockers=11`, including the expected `git` blocker
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`

After the documentation/evidence commit, rerun go/no-go from a clean worktree.
The expected product state is still NO-GO because the runtime CPU gates require
the required machine count, not only `HUGH_SECOND`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3602 files` and `3917 symbols`.
- Index search for `wiki/1202` returns this report and `docs/WIKI.md`.
- Index search for
  `CURRENT_LOCAL_PACKAGE_EVIDENCE_REFRESH_AFTER_RELAY_INTENT` returns this
  report and the wiki entries.
- Index search for `20260701-054634` returns the new brain product proof
  evidence plus this report.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` reported `processed=3`, `recovered=0`.
- `/v1/query` for
  `wiki/1202 CURRENT_LOCAL_PACKAGE_EVIDENCE_REFRESH_AFTER_RELAY_INTENT 20260701-053248`
  returned 3 results with top title
  `wiki/1202 current local package evidence refresh after relay intent gate`.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is still incomplete. | Dirty go/no-go still reports `full_product_spec_ready=false`; remaining blockers include two-machine, public metadata, Store, P2P/relay, design, and V34 lanes. | Do not call rc.22 public-release ready. | Complete the external and physical proof lanes. |
| HIGH | Runtime CPU on this PC is healthy, but the release gate needs more than this PC. | Idle CPU and matrix both pass on `HUGH_SECOND`; go/no-go counts valid machines as `1`. | The local "slow" feeling is measurement cost, not current idle busy-loop evidence. | Run/import the same CPU evidence from the other required physical PC. |
| HIGH | The targeted route is direct LAN only, not release-grade secure transport. | Matrix route explain selects `hugh-main` at `192.168.1.192:4387`, `route_kind=lan`, `current_transport=http_bearer`, `peer_identity_verified=false`, `route_evidence_ready=false`. | It proves work-targetability for this LAN setup, not QUIC/TLS or relay release readiness. | Implement/prove release-grade direct/relay transport evidence. |
| MED | Brain integration handoff is present and intentionally local-overridden. | Canonical brain file exists at `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`; local copy exists at `docs/HANDOFF-musu-integration.md` with a MUSU-BEE note. | Future agents can find the rules in either repo; local product root contract remains `~/.musu/brain`. | Keep canonical brain handoff as source context; do not override product root with standalone `~/.musubrain`. |
| MED | Brain sidecar observability/self-heal is still too indirect. | During final brain indexing, packaged bridge PID `33160` and desktop PID `18492` were running, but no `musu-brain` process or `127.0.0.1:8080` listener existed. The packaged `musu-brain.exe` was then started with product root/env and the proof passed. | A user or agent can have a healthy desktop/bridge while the hidden knowledge sidecar is down. | Add Cockpit/doctor-visible brain health plus a restart/self-heal action that does not expose token values. |

## Product Spec Notes

- The relay intent opt-in source change is now present in an installed local
  package. It is still only an intent-boundary improvement. It does not
  implement `quic_relay_tunnel` or delegated-work relay payload transport.
- The hidden brain sidecar remains a product-owned chip: MSIX includes
  `musu-brain.exe`, declares it as `fullTrustProcess`, and uses `~/.musu/brain`
  outside MSIX LocalState.
- Current package brain ingest/recall proof is refreshed as
  `20260701-054634` and passes on `HUGH_SECOND`.
- The brain handoff rule remains: brain Go code is not rewritten into Rust;
  MUSU owns lifecycle, root resolution, sidecar launch, and UX.
- The measured script runtime is expected: CPU matrix is five 60-second
  scenarios plus a route probe. That is a release-evidence harness cost, not
  evidence that the product runtime is slow.

## Next Steps

1. Run/import second physical PC local package evidence, especially
   `runtime-idle-cpu` and the five-scenario runtime CPU matrix.
2. Fix `musu.pro` public metadata DNS/TLS/public-config checks or document and
   record the intended public DNS provider state.
3. Complete Store/Partner Center approval plus Store-signed install and launch
   evidence.
4. Implement and prove release-grade relay transport with payload delivery
   proof; display/control-plane rows are not enough.
5. Record explicit design approval evidence.
6. Record V34 stale registry/cache/manual-peer self-heal physical proof.
7. Capture Private Mesh packaged desktop release proof from the installed app,
   not only standalone diagnostic scripts.
