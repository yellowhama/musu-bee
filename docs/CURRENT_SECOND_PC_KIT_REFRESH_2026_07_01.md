# Current Second-PC Kit Refresh - 2026-07-01

## Summary

Regenerated the second-PC proof kit from the current clean
`feat/v33-residual-finalize` HEAD so the next physical `hugh-main` return is
not tied to stale source.

## Kit

- Version: `1.15.0-rc.22`
- Package: `musu_1.15.0.22_x64_local-sideload-manual.msix`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-003206`
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-003206.zip`
- SHA256:
  `b4a5e14f5cb50554e372fc5e2e7d9c12165d3ec3abb7f5844e1358abf5765fff`
- Generated at: `2026-07-01T00:32:15.2333262+09:00`
- Source branch: `feat/v33-residual-finalize`
- Source commit: `c7ab4d916efa03f143e251b738511bd61598ef55`
- Dirty: `false`

## Why This Matters

The previous current kit was `20260701-000516`, generated from clean commit
`33b0ca155991ba4f46422288cde9cc36d0b5840c`. The branch has since gained the
brain root-env source contract and the `musu-brain.pin.json` update to clean
brain commit `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`. Returning second-PC
evidence from the older kit would be source-stale relative to the current
branch.

## Updated Handoffs

- `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`
- `docs/NEXT_STEPS_AFTER_CURRENT_PACKAGE_REFRESH_2026_06_30.md`
- `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`
- `docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3528 files` and `3908 symbols`.
- Search for `003206 second PC kit` returns this document,
  `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`, `docs/WIKI.md`, and
  `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.

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
