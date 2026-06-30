# Current Second-PC Kit Refresh - 2026-07-01

## Summary

Regenerated the second-PC proof kit from the current clean
`feat/v33-residual-finalize` HEAD so the next physical `hugh-main` return is
not tied to stale source.

## Kit

- Version: `1.15.0-rc.22`
- Package: `musu_1.15.0.22_x64_local-sideload-manual.msix`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-000516`
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-000516.zip`
- SHA256:
  `2966f53e7dac6e1703f7ba694f3b95ef66b6f3b3977059a237d2f6ea52402558`
- Generated at: `2026-07-01T00:05:27.9288438+09:00`
- Source branch: `feat/v33-residual-finalize`
- Source commit: `33b0ca155991ba4f46422288cde9cc36d0b5840c`
- Dirty: `false`

## Why This Matters

The previous current kit was `20260630-232004`, generated from clean commit
`e280648f2a9c2632e869d679bf1a4d4e221f7005`. The branch has since gained the
public metadata DNS path-mode verifier/planner fix and updated handoff/wiki
state. Returning second-PC evidence from the older kit would be source-stale
relative to the current branch.

## Updated Handoffs

- `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`
- `docs/NEXT_STEPS_AFTER_CURRENT_PACKAGE_REFRESH_2026_06_30.md`
- `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`
- `docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3527 files` and `3907 symbols`.
- Search for `CURRENT_SECOND_PC_KIT_REFRESH current second PC kit` returns this
  document and `docs/WIKI.md`.

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
