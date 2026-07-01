# Current Second-PC Kit Refresh After Brain Pin Update (2026-07-01)

## Summary

The second-PC release-check kit has been regenerated from the current clean
source after the brain pin package refresh.

This does **not** close the `multi-device`, `runtime-idle-cpu`, or
`runtime-cpu-scenario-matrix` gates. It only replaces the stale kit reference
so `hugh-main` can run against the current source/package state.

## Kit

- Version: `1.15.0-rc.22`
- Startup contract: `local-sideload-manual`
- Source branch: `feat/v33-residual-finalize`
- Source commit: `86bd6a2fe1f809a7788173f6936bf6c97042652e`
- Source dirty: `false`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-185956`
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-185956.zip`
- SHA256:
  `4a82644b867c541bd8c3af46736e1e33b23188f70df8d4bcc83e3f1e647f85fe`
- Metadata:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-185956/kit-build-metadata.json`
- Package included:
  `musu_1.15.0.22_x64_local-sideload-manual.msix`
- Certificate included:
  `Yellowhama.MUSU_cert.cer`

## Verification

`prepare-multidevice-test-kit.ps1 -Json` returned:

- `ok=true`
- `schema=musu.multidevice_test_kit_prepare.v1`
- `generated_at=2026-07-01T19:00:11.3300240+09:00`
- `git.commit=86bd6a2fe1f809a7788173f6936bf6c97042652e`
- `git.dirty=false`
- `zip_sha256=4a82644b867c541bd8c3af46736e1e33b23188f70df8d4bcc83e3f1e647f85fe`

## Product Meaning

The operator now has a current package/check kit for `hugh-main`. The previous
documented kit `20260701-135632` is stale for the current source because the
repo has since moved through the brain pin refresh and local package evidence
commits.

The product remains **NO-GO** until `hugh-main` runs this current kit or an
equivalent current install/check path and returns evidence that can be imported
and verified.

## Run On `hugh-main`

Extract:

```text
.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-185956.zip
```

Then run from inside the extracted kit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix -FailOnPrivateMeshPhysicalPeerEvidence
```

Return:

```text
.local-build/second-pc-return/*.zip
```

Then import on this repo before recording final two-machine gates.

