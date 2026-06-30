# Store-Reviewed Bundle Refresh - 2026-07-01

## Summary

The Store-reviewed MSIX output and Partner Center submission bundle were stale
after the packaged brain sidecar full-trust fix. The old
`store-reviewed-20260628-005038` bundle still contained an MSIX whose manifest
was missing the `windows.fullTrustProcess` declaration for `musu-brain.exe`.

This refresh rebuilt the Store-reviewed package from the current source and
prepared a new submission bundle:

- MSIX:
  `.local-build\msix\output\musu_1.15.0.22_x64_store-reviewed-immediate-registration.msix`
- Bundle:
  `.local-build\msix\submission-bundles\store-reviewed-20260701-021954`
- Package version: `1.15.0.22`
- Product version: `1.15.0-rc.22`
- Source commit for the final go/no-go manifest:
  `411f19579e4c36565cdd351087ecef27f57b4edd`

## Verification

- `build-msix.ps1 -Configuration release -Architecture x64 -StartupContract store-reviewed-immediate-registration -NoBump`
  completed successfully.
- `verify-msix-package.ps1 -PackagePath .local-build\msix\output\musu_1.15.0.22_x64_store-reviewed-immediate-registration.msix -StartupContract store-reviewed-immediate-registration -SkipSmoke`
  passed and confirmed:
  - `IncludesDesktop=True`
  - `IncludesMusu=True`
  - `IncludesBrain=True`
  - `IncludesStartup=True`
  - `StartupImmediateRegistration=true`
  - `HasRestrictedStartupCapability=True`
- `audit-msix-desktop-entrypoint.ps1` passed for the Store-reviewed artifact
  with `ok=true` and application executable `musu-desktop.exe`.
- `prepare-store-submission-bundle.ps1 -Configuration release -Architecture x64 -SkipBuild`
  created `store-reviewed-20260701-021954`.
- `verify-store-submission-bundle.ps1 -BundleDir .local-build\msix\submission-bundles\store-reviewed-20260701-021954 -Json`
  passed with `ok=true`, `fail_count=0`.
- `audit-desktop-release-readiness.ps1 -Json` now reports
  `runtime_package_ready=true`.
- Clean `write-release-go-no-go.ps1 -Json` completed at
  `2026-07-01T02:22:47.3375209+09:00` with:
  - `full_product_spec_ready=false`
  - `ready_for_public_desktop_release=false`
  - `blockers=10`
  - `local_artifacts_ready=true`
  - `manifest_git.dirty=false`

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3559 files` and `3908 symbols` in `71210 ms`.
- `musu indexer search --query "STORE_REVIEWED_BUNDLE_REFRESH_2026_07_01 runtime_package_ready"`
  returned `docs/STORE_REVIEWED_BUNDLE_REFRESH_2026_07_01.md`.
- `musu indexer search --query "Store-reviewed bundle refresh after brain sidecar fix"`
  returned `docs/WIKI.md`.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet;
  `/v1/query` for `wiki/1196 store-reviewed-20260701-021954
  runtime_package_ready` returned 3 results with top title
  `wiki/1196 WIKI entry`.

## Audit Findings

| Severity | Issue | Evidence | Impact | Next |
| --- | --- | --- | --- | --- |
| NO-GO | Product is not complete. | go/no-go still reports `blockers=10`. | This cannot be represented as public-release ready or full-product complete. | Close the remaining external, physical, and relay-runtime gates. |
| HIGH | Store-reviewed local artifact is fixed, but Store release is still external. | Bundle verifier passes, but `store-release` blocker remains. | Partner Center certification, restricted capability approval, and Store-signed install proof are still missing. | Submit the refreshed bundle and record Store-signed install/launch evidence after approval. |
| HIGH | Public metadata remains DNS/TLS blocked. | `public_metadata_ok=false`; Cloudflare DNS and apex TLS failures remain. | Public install/support/privacy metadata cannot be certified from `https://musu.pro`. | Repair external DNS/TLS and rerun the public metadata verifier. |
| HIGH | Release-grade delegated relay transport remains unproven. | P2P env blockers include `source_release_relay_tunnel_runtime_not_implemented`; route evidence remains `none_http_bearer` for direct LAN proof. | Relay/display status must not be treated as a real work route. | Implement/prove release relay payload transport with owner-scoped live evidence. |
| MED | Two-machine runtime evidence is still missing. | Runtime idle CPU and CPU matrix are valid on `HUGH_SECOND` only. | Local package health is not enough for release fleet confidence. | Run/import the current second-PC kit and CPU matrix on `hugh-main`. |
| MED | V34 stale self-heal remains code-plus-candidate, not physical proof. | go/no-go keeps `v34-stale-self-heal`. | Stale registry/cache/manual-peer recovery is not release-proven. | Record physical V34 stale-state evidence. |

## Product Meaning

The local Store-reviewed upload artifact now matches the packaged brain MSIX
spec: `musu-brain.exe` is present and package verification no longer rejects the
manifest full-trust contract. This closes the local `runtime-package` blocker
that was reopened by the stale Store-reviewed MSIX output.

This does not close public release readiness. The remaining blockers are:
multi-device, Private Mesh packaged release proof, two-machine idle CPU,
two-machine runtime CPU matrix, public metadata DNS/TLS, Store release,
P2P control plane, design approval, real relay transport, and V34 stale
self-heal.

## Next Steps

1. Run the current second-PC kit on `hugh-main`, then import the return archive.
2. Capture second-machine `desktop-open` idle CPU and full runtime CPU matrix.
3. Repair `musu.pro` DNS/TLS so `/privacy`, `/support`, and
   `/api/public-config` pass the canonical public metadata verifier.
4. Submit the refreshed Store bundle to Partner Center and later record
   certification/restricted-capability plus Store-signed install evidence.
5. Continue the release relay transport implementation lane; do not treat
   display-only relay state as payload transport proof.
