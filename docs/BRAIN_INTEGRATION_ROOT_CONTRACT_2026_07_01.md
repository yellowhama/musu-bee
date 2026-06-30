# Brain Integration Root Contract (2026-07-01)

## Verdict

The MUSU product root for the hidden brain chip is **`~/.musu/brain`**.

`F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md` remains the canonical
brain-side handoff for what the Go engine is and how it was built. That handoff
also describes the standalone brain defaults under `~/.musubrain`. For the MUSU
desktop product, the standalone default is not the product contract. MUSU owns
the resolver and pins the product root under the existing MUSU profile root.

2026-07-01 package proof update: the root contract has now been rebuilt into
the local-sideload MSIX on `HUGH_SECOND` and re-proven through
`docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`. The package proof also
found and fixed the missing MSIX `fullTrustProcess` declaration for
`musu-brain.exe`, which is now part of the product contract and verifiers.

2026-07-01 lifecycle audit update: after the brain doctor/status source change
was rebuilt and installed, a fresh brain product proof
`20260701-071746-HUGH_SECOND` failed because the packaged desktop was alive but
the hidden `musu-brain` process was not. Manually starting the same packaged
binary with `-root ~/.musu/brain` made `/health` return OK, so the root and chip
are valid; the unresolved contract gap is desktop lifecycle supervision.

2026-07-01 autostart supervision source update: lifecycle supervision now has
source-level durable evidence. `spawn_knowledge_sidecar_autostart()` is guarded
against overlapping start attempts, writes
`~/.musu/brain/runtime/sidecar-autostart-status.json`, appends sidecar
stdout/stderr logs under `~/.musu/brain/runtime`, and waits for loopback health
readiness. This update is not yet package-proven; the package proof lane stays
open until a rebuilt MSIX passes brain product proof without manual sidecar
start.

## Product Contract

- Product root: `~/.musu/brain`.
- Never use MSIX `LocalState` as the brain data root.
- The brain Go binary remains a self-contained chip; MUSU is the motherboard
  that owns data root, lifecycle, and UX.
- User notes and private brain data are not pushed or synced as product code.
- MUSU must pass the root explicitly instead of letting the desktop, runtime,
  MCP layer, and brain CLI guess independently.
- A manual `musu-brain server` start does not satisfy the product contract.
  The packaged desktop must start or restart the hidden sidecar and leave
  durable evidence when that launch fails.

## Source Wiring

Current code now makes the root contract explicit in the desktop process tree:

- `musu-bee/src-tauri/src/lib.rs::knowledge_root()` resolves
  `musu_home().join("brain")`.
- `spawn_knowledge_sidecar_autostart()` starts `musu-brain server` with
  `-root <~/.musu/brain>`.
- `spawn_knowledge_sidecar_autostart()` now records guarded launch status under
  `~/.musu/brain/runtime/sidecar-autostart-status.json` using schema
  `musu.knowledge_sidecar_autostart.v1`.
- Sidecar stdout/stderr logs are written under the same runtime directory.
- The same sidecar spawn now exports:
  - `MUSU_KNOWLEDGE_ROOT=<~/.musu/brain>`
  - `MUSUBRAIN_ROOT=<~/.musu/brain>`
- `apply_knowledge_env()` now exports the same root env vars to the runtime
  child together with `MUSU_KNOWLEDGE_*` ingest URL, scope, and token-file env.
- A source test locks the product contract so the desktop root does not regress
  to the standalone `~/.musubrain` default.

## Brain Repo State

The brain handoff was followed by a packaging hygiene fix in the brain repo:

- brain repo: `F:\musu_2nd_brain`
- pushed commit: `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`
- change: `.gitignore` now ignores SQLite `*.db-shm` and `*.db-wal` sidecar
  files.

Reason: `scripts/windows/build-msix.ps1::Assert-BrainRepoMatchesPin` refuses to
start a release build when the external knowledge chip checkout is dirty. The
brain repo already ignored `*.db`; it did not ignore SQLite WAL/SHM sidecars,
which made a code-clean checkout look dirty.

`musu-bee/src-tauri/musu-brain.pin.json` now points at that clean pushed brain
HEAD.

## Qualitative Audit

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| HIGH | The root conflict is resolved for MUSU source and now locally package-proven on `HUGH_SECOND`. | `docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`; `20260701-012822` brain product proof uses `C:\Users\empty\.musu\brain`. | The local MSIX package contains the root contract. Public channel and second-PC freshness still need separate proof. | Keep this lane green after any source/package change; refresh hosted channel before other-PC install. |
| NO-GO | The hidden brain lifecycle is source-fixed but not currently package-proven after the doctor/status rebuild. | `docs/evidence/brain-product/1.15.0-rc.22/20260701-071746-HUGH_SECOND.brain-product-verification.json` has `ok=false`, `fail_count=14`, no sidecar process, and no health proof; `docs/BRAIN_SIDECAR_AUTOSTART_SUPERVISION_2026_07_01.md` records the source fix. | The product cannot claim the user-invisible motherboard+chip experience is complete until the source fix is rebuilt and proven from the installed package. | Rebuild/reinstall, inspect `knowledge.autostart_status`, and recapture brain product proof from a clean packaged desktop launch without manual sidecar start. |
| HIGH | MSIX must declare the brain sidecar as full trust. | `20260701-012657` MSIX install evidence records `brain_full_trust_process=true`. | File presence alone can produce a dead hidden brain sidecar. | Keep package and installed-package verifiers rejecting missing `fullTrustProcess`. |
| HIGH | The standalone brain default remains `~/.musubrain`. | Brain handoff Part 1 describes standalone data layout. | Future agents could reintroduce split stores if they follow standalone defaults inside MUSU. | Treat this document and `BRAIN_INTEGRATION_THESIS` as the MUSU product overlay. |
| MED | MCP registration is still a policy/UX task. | Brain handoff recommends `print-config` and print-don't-write. | Auto-editing Codex/Claude/Gemini config without consent would violate the brain handoff. | Cockpit/installer should show paste snippets or use an explicit user-consent gate. |

## Next Steps

1. Keep targeted Tauri tests and the MSIX brain pin preflight path in every
   package build.
2. Keep MSIX package/install evidence requiring `musu-brain.exe` full-trust
   declaration.
3. Refresh the hosted `musu.pro` install channel before installing this fixed
   package on `hugh-main`.
4. Keep cockpit recall/capture UX and autocollect expansion behind this root
   contract plus fresh package evidence.
5. Keep the lifecycle proof lane open until the rebuilt package records
   `knowledge.autostart_status.readiness_ok=true` and brain product proof passes
   without manual sidecar start.
