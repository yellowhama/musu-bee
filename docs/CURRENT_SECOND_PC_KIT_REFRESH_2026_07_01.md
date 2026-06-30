# Current Second-PC Kit Refresh - 2026-07-01

## Summary

Regenerated the second-PC proof kit from the current clean
`feat/v33-residual-finalize` HEAD so the next physical `hugh-main` return is
not tied to stale source after the brain handoff alignment audit commit.

## Kit

- Version: `1.15.0-rc.22`
- Package: `musu_1.15.0.22_x64_local-sideload-manual.msix`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-025502`
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-025502.zip`
- SHA256:
  `12c607d499c33686a8d9c4debe5010766a33b137dac9dfc6fd42a9e2ee51dea9`
- Generated at: `2026-07-01T02:55:19.0243502+09:00`
- Metadata generated at: `2026-07-01T02:55:03.6466041+09:00`
- Source branch: `feat/v33-residual-finalize`
- Source commit: `635a161f49b2266fa9758de6b5d5ca14b040ca64`
- Dirty: `false`

## Why This Matters

The previous current kit was `20260701-003206`, generated from clean commit
`c7ab4d916efa03f143e251b738511bd61598ef55`. The branch has since gained the
brain handoff alignment audit, wiki/spec updates, and product-brain indexing
recorded at clean commit `635a161f49b2266fa9758de6b5d5ca14b040ca64`.
Returning second-PC evidence from the older kit would be source-stale relative
to the current branch.

## Updated Handoffs

- `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`
- `docs/NEXT_STEPS_AFTER_CURRENT_PACKAGE_REFRESH_2026_06_30.md`
- `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`
- `docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3560 files` and `3908 symbols`.
- Search for exact SHA
  `12c607d499c33686a8d9c4debe5010766a33b137dac9dfc6fd42a9e2ee51dea9`
  returns this document, `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`, and
  `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.
- Search for `wiki 1198 current second PC kit` returns `docs/WIKI.md`.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` processed 3 new sources with `recovered=0`.
- `/v1/query` for `wiki/1198 20260701-025502 12c607 second-PC kit` returned
  3 results with top title `wiki/1198 current second-PC kit report`.

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
