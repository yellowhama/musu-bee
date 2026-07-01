# Current Second-PC Kit Refresh - 2026-07-01

## Summary

Regenerated the second-PC proof kit from the current clean
`feat/v33-residual-finalize` HEAD so the next physical `hugh-main` return is
not tied to stale source after the final local evidence closeout and final
wiki/index commit.

## Kit

- Version: `1.15.0-rc.22`
- Package: `musu_1.15.0.22_x64_local-sideload-manual.msix`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-112343`
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-112343.zip`
- SHA256:
  `ea77111bb29559317b67b070c5f2432ad40c77a6dbce4bbec596ebaec4d2e5da`
- Generated at: `2026-07-01T11:23:58.6689761+09:00`
- Metadata generated at: `2026-07-01T11:23:45.4221057+09:00`
- Source branch: `feat/v33-residual-finalize`
- Source commit: `6fdc1f3c545c2d401881e64c972c0ca48b15f8fa`
- Dirty: `false`
- Internal checksum verification: `ok=true`, `checksum_mismatches=0`,
  `file_count=51`.

## Why This Matters

The previous current kit was `20260701-025502`, generated from clean commit
`635a161f49b2266fa9758de6b5d5ca14b040ca64`. The branch has since gained the
final local evidence closeout, the post-documentation go/no-go recheck, and the
final wiki/index/recall commit recorded at clean commit
`6fdc1f3c545c2d401881e64c972c0ca48b15f8fa`.
Returning second-PC evidence from the older kit would be source-stale relative
to the current branch.

## Brain Handoff Audit

The canonical brain-side handoff was rechecked at
`F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`; that repo is clean on
`main` at `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`. The handoff still
describes the standalone brain defaults under `~/.musubrain`; the MUSU product
overlay remains `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`, which
pins the hidden packaged product root to `~/.musu/brain`.

This distinction is intentional: brain remains the Go chip, while MUSU remains
the motherboard that owns product data root, lifecycle, UX, and explicit
`MUSUBRAIN_ROOT` / `MUSU_KNOWLEDGE_ROOT` env injection. The second-PC kit does
not change that contract.

## Updated Handoffs

- `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`
- `docs/NEXT_STEPS_AFTER_CURRENT_PACKAGE_REFRESH_2026_06_30.md`
- `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`
- `docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3674 files` and `3947 symbols`.
- Search for exact SHA
  `ea77111bb29559317b67b070c5f2432ad40c77a6dbce4bbec596ebaec4d2e5da`
  returns this document, `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`,
  `docs/WIKI.md`, and the roadmap.
- Search for `wiki 1214 current second PC kit final local evidence` returns
  this document and `docs/WIKI.md`.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  posted 5 sources for this report, the second-PC handoff, the roadmap
  section, the wiki entry, and the wiki index entry.
- `/v1/process` processed 5 sources with `recovered=0`.
- `/v1/query` for `wiki/1214 20260701-112343 ea7711 second-PC kit` returned
  5 results with top title `wiki/1214 final current second-PC kit report`.

## Product Status

This does not close any physical evidence gate by itself. The product remains
No-Go until `hugh-main` runs the kit, returns the evidence zip, and the import
and release verifiers pass. It also does not close release-grade relay
transport, V34 stale self-heal, public metadata DNS/TLS, Store release, or
design approval.

## Run Command For hugh-main

From inside the extracted kit directory on `hugh-main`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix -FailOnPrivateMeshPhysicalPeerEvidence
```
