# Current Packaged Brain MSIX Audit (2026-07-01)

## Verdict

MUSU is still **NO-GO** for the full product spec and public desktop release.

The current `HUGH_SECOND` local-sideload package does, however, now prove the
packaged hidden-brain lane:

- package version: `1.15.0.22`
- release version: `1.15.0-rc.22`
- installed package:
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`
- artifact:
  `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`
- brain root:
  `C:\Users\empty\.musu\brain`
- brain loopback:
  `http://127.0.0.1:8080`

## What Changed

The important product-spec correction is MSIX execution identity.

Staging `musu-brain.exe` into the package and listing it in Tauri `externalBin`
is not enough. A Windows packaged app cannot reliably launch that sidecar
unless the AppxManifest declares it as a full trust process. The package must
include:

```xml
<desktop:Extension Category="windows.fullTrustProcess" Executable="musu-brain.exe" EntryPoint="Windows.FullTrustApplication">
  <desktop:FullTrustProcess />
</desktop:Extension>
```

This is now source-gated and evidence-gated:

- `scripts/windows/build-msix.ps1` emits the brain full-trust declaration.
- `scripts/windows/verify-msix-package.ps1` rejects packages missing the brain
  executable or manifest declaration.
- `scripts/windows/verify-installed-msix-package.ps1` rejects installed
  packages missing the brain executable or manifest declaration.
- `scripts/windows/msix-common.ps1`,
  `scripts/windows/capture-msix-install-evidence.ps1`, and
  `scripts/windows/verify-msix-install-evidence.ps1` carry this into the
  release evidence contract.

## Product Contract Updates

- The hidden knowledge chip is `musu-brain.exe`, bundled with the desktop MSIX.
- The MSIX manifest must declare `musu-brain.exe` as `windows.fullTrustProcess`.
- MUSU owns the brain data resolver. Product root is `~/.musu/brain`, not
  MSIX LocalState and not the standalone brain default.
- Tauri starts the brain sidecar with `-root <~/.musu/brain>` and exports both
  `MUSU_KNOWLEDGE_ROOT` and `MUSUBRAIN_ROOT` with the same value.
- The sidecar is loopback-only at `127.0.0.1:8080`; product access should go
  through MUSU-owned env/proxy surfaces, not a public brain HTTP contract.
- `runtime/musu-ingest.token` remains required and ACL-restricted.

## Evidence Recorded

Brain/MSIX-specific evidence:

- `docs/evidence/msix-install/1.15.0-rc.22/20260701-012657-HUGH_SECOND.evidence.json`
- `docs/evidence/msix-install/1.15.0-rc.22/20260701-012657-HUGH_SECOND.verification.json`
- `docs/evidence/msix-install/1.15.0-rc.22/20260701-012657-HUGH_SECOND.summary.md`
- `docs/evidence/brain-product/1.15.0-rc.22/20260701-012822-HUGH_SECOND.brain-product-proof.json`
- `docs/evidence/brain-product/1.15.0-rc.22/20260701-012822-HUGH_SECOND.brain-product-verification.json`

Package/local runtime evidence refreshed after the fix:

- `docs/evidence/single-machine/1.15.0-rc.22/20260701-012801-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260701-012801-HUGH_SECOND.verification.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260701-012801-HUGH_SECOND.summary.md`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260701-0128-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-0128-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-0128-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-013023-HUGH_SECOND.desktop-single-instance.json`
- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-013155-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-013333-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-013333-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-013333-HUGH_SECOND.target-route.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-013333-HUGH_SECOND.post-route.route-evidence.json`

Notable facts:

- MSIX install verification records `brain_full_trust_process=true` and
  `brain_executable=musu-brain.exe`.
- Brain product proof records `ok=true` and observes the sidecar process.
- Brain ingest/capture and recall proof pass against `http://127.0.0.1:8080`.
- Desktop single-instance and desktop-open idle CPU evidence pass from clean git
  states.
- Runtime CPU scenario matrix passes all five scenarios, including a targeted
  `hugh-main` post-route probe.

## LLM/Brain Indexing

The following current code and documentation surfaces were indexed into the
local MUSU brain workspace through `POST /v1/sources` under token scope
`local/musu`:

- `scripts/windows/build-msix.ps1`
- `scripts/windows/verify-msix-package.ps1`
- `scripts/windows/verify-installed-msix-package.ps1`
- `scripts/windows/msix-common.ps1`
- `scripts/windows/capture-msix-install-evidence.ps1`
- `scripts/windows/verify-msix-install-evidence.ps1`
- `docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`
- `docs/HANDOFF-musu-integration.md`
- `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`
- `docs/BRAIN_INTEGRATION_THESIS_2026_06_26.md`
- `docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

Recall verification query:
`wiki/1194 packaged brain MSIX fullTrustProcess musu-brain.exe`.

Result: 5 hits returned. Top hits included this audit document,
`verify-msix-package.ps1`, `verify-installed-msix-package.ps1`,
`BRAIN_INTEGRATION_THESIS_2026_06_26.md`, and
`verify-msix-install-evidence.ps1`.

## Findings

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is still incomplete. | Current blockers still include release-grade route identity/encryption, second-PC release evidence, public metadata DNS/TLS, Store, relay, V34, design approval, and Private Mesh archive proof. | Do not claim product completion or public desktop release readiness. | Keep release claims scoped to the green local brain/package lane. |
| NO-GO | Current multi-device route still proves LAN targetability, not release-grade transport. | `20260701-013333` route evidence targets `hugh-main`, but still reports `peer_identity_verified=false` and `encryption=none_http_bearer`. | Work can route, but the route is not acceptable for release-grade identity/encryption claims. | Implement/prove accepted QUIC/TLS or equivalent release transport. |
| HIGH | The prior brain sidecar failure was a real package contract bug, not an operator mistake. | Before the fix, the installed `musu-brain.exe` was present but direct execution returned Access Denied and `/health` was refused. After adding fullTrustProcess, sidecar process and `/health` pass. | Without the manifest declaration, a package can look complete while the hidden brain is dead. | Keep manifest checks in package and installed-package verifiers permanently. |
| HIGH | Brain product lane is locally green on `HUGH_SECOND`. | `20260701-012822` brain product proof: package `1.15.0.22`, root `~/.musu/brain`, loopback health, task/capture ingest, and recall all pass. | The motherboard+chip local package contract is now real for this machine. | Repeat only if package/source changes again; otherwise move to public channel and second-PC proof. |
| HIGH | Public install/channel state is not proven by this local sideload run. | Evidence is local-sideload package evidence; no new hosted `musu.pro` installer publication was captured in this fix batch. | The other PC should not be assumed to get this exact fixed package until the hosted channel is refreshed and verified. | Publish or verify the hosted install channel before asking `hugh-main` to install from `musu.pro`. |
| MED | Hidden sidecar observability is still too indirect. | The bug was found through product proof and process/health inspection; release stderr is intentionally quiet. | Future sidecar spawn failures could be hard to diagnose from Cockpit. | Add a Cockpit/doctor-visible brain status with root, process, health, and token ACL checks, without exposing token values. |
| MED | Build warning noise remains. | Build warnings include release relay placeholder dead code and one Tauri `unused_mut`. | Not blocking, but warning noise can hide future regressions. | Clean after relay runtime lane stabilizes. |

## Confidence

- High confidence: current local MSIX package can launch the hidden brain
  sidecar and use `~/.musu/brain` for ingest/recall.
- High confidence: future MSIX package evidence will fail if the brain
  full-trust declaration disappears.
- Medium confidence: current direct work-targetability to `hugh-main` works on
  LAN, but it is explicitly non-release-grade.
- Unknown / needs evidence: hosted `musu.pro` install channel freshness,
  Store-signed package behavior, and full second-PC package return after this
  exact fix.

## Next Steps

1. Refresh or verify the hosted `musu.pro` install channel for this fixed
   package before using it on `hugh-main`.
2. Run the current second-PC kit on `hugh-main`, import the return zip, and
   verify CPU/matrix/Private Mesh proof archives.
3. Finish the release-grade transport lane: peer identity plus accepted
   encryption proof, not `none_http_bearer`.
4. Add visible brain-sidecar diagnostics to doctor/Cockpit so fullTrust/root/
   token/health failures are first-class product status.
5. Rerun `write-release-go-no-go.ps1 -Json` after docs are committed; only
   claim full completion when it reports zero blockers.
