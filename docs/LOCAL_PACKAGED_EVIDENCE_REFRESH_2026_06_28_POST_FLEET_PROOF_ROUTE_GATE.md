# Local Packaged Evidence Refresh After Fleet-Proof Route Gate (2026-06-28)

## Result

The local packaged freshness lanes were refreshed after the public
`fleet-proof.ps1` release-grade route gate hardening. The product is still
NO-GO, but the source-freshness regressions are closed again.

Latest clean go/no-go:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-28T20:33:58.3354650+09:00`
- Commit: `c3bd5ed68024fff38b8e8c031f411144c10cb293`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`
- `manifest_git.dirty=false`

Remaining blockers:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

## Evidence

Committed evidence:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-202115-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-202115-HUGH_SECOND.verification.json`
- Single-machine summary:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-202115-HUGH_SECOND.summary.md`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-202128-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-202128-HUGH_SECOND.startup-single-instance.json`
- Startup nested process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-202128-HUGH_SECOND.startup-single-instance.process-ownership.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-202128-HUGH_SECOND.desktop-single-instance.json`
- Runtime idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-202216-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-202500-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU scenario matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-202500-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`

The matrix was captured from clean git state at commit
`f45fb82b930796bb7975a53a634f6a7f61bf176d` and verified at commit
`c3bd5ed68024fff38b8e8c031f411144c10cb293`. The verifier accepted the later
commit because the delta is documentation/evidence only.

The matrix route probe targeted `hugh-main` and returned
`MUSU_CPU_SCENARIO_ROUTE_OK_20260628_202500`. It still records the current
direct LAN transport as HTTP bearer, not release-grade QUIC/TLS. That is
expected: this refresh closes local packaged freshness, not the release-grade
multi-device or relay transport blockers.

## Code Audit

No runtime code changed in this refresh. The work was evidence capture,
verification, and documentation.

Observed behavior:

- Packaged runtime repair stopped stale state, started the WindowsApps package,
  and produced a packaged bridge at `0.0.0.0:7275`.
- Single-machine smoke passed against the packaged bridge with CLI route
  checked.
- Process ownership passed with one packaged `musu.exe bridge`, no repo runtime,
  and no repo orphan helpers.
- Startup single-instance reused bridge PID `33040` across repeated startup
  invocations.
- Desktop repeated activation left exactly one packaged `musu-desktop.exe`.
- Runtime idle CPU passed a 60s `desktop-open` sample with no hot process.
- Runtime CPU scenario matrix passed all five required scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`.

No additional code regression was found in the local packaged runtime surfaces.
The remaining NO-GO lanes require physical second-PC evidence, external DNS/TLS
repair, Store/Partner Center evidence, design approval, real relay transport,
or V34 physical stale-state proof.

## Indexing

`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
3417 files and 3883 symbols after the evidence and documentation update.
Recall for `Local Packaged Evidence Refresh` returns this report. Exact
underscore-heavy route tokens are present in the files and verified with `rg`,
but the current indexer tokenization does not reliably recall those exact
strings as standalone queries.

## Next

1. Run/import the latest second-PC release kit on `hugh-main` after the hardened
   route path is available.
2. Repair canonical apex `musu.pro` DNS/TLS and rerun
   `verify-store-public-metadata.ps1`.
3. Implement release-grade delegated-work transport and capture strict
   multi-device route proof.
4. Complete Store/Partner Center proof and explicit design approval.
5. Run the V34 physical stale self-heal proof on two packaged machines.
