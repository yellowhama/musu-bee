# Brain Integration Root Contract (2026-07-01)

## Verdict

The MUSU product root for the hidden brain chip is **`~/.musu/brain`**.

`F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md` remains the canonical
brain-side handoff for what the Go engine is and how it was built. That handoff
also describes the standalone brain defaults under `~/.musubrain`. For the MUSU
desktop product, the standalone default is not the product contract. MUSU owns
the resolver and pins the product root under the existing MUSU profile root.

## Product Contract

- Product root: `~/.musu/brain`.
- Never use MSIX `LocalState` as the brain data root.
- The brain Go binary remains a self-contained chip; MUSU is the motherboard
  that owns data root, lifecycle, and UX.
- User notes and private brain data are not pushed or synced as product code.
- MUSU must pass the root explicitly instead of letting the desktop, runtime,
  MCP layer, and brain CLI guess independently.

## Source Wiring

Current code now makes the root contract explicit in the desktop process tree:

- `musu-bee/src-tauri/src/lib.rs::knowledge_root()` resolves
  `musu_home().join("brain")`.
- `spawn_knowledge_sidecar_autostart()` starts `musu-brain server` with
  `-root <~/.musu/brain>`.
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
| HIGH | The root conflict is resolved for MUSU source, but package proof is stale until a rebuild. | Source now exports root env vars and pin moved to `eb0c0ec`; installed package evidence predates this source change. | Do not claim a new package contains this contract until rebuilt and re-proven. | Rebuild/reinstall rc.22 successor or next package, then rerun brain product proof. |
| HIGH | The standalone brain default remains `~/.musubrain`. | Brain handoff Part 1 describes standalone data layout. | Future agents could reintroduce split stores if they follow standalone defaults inside MUSU. | Treat this document and `BRAIN_INTEGRATION_THESIS` as the MUSU product overlay. |
| MED | MCP registration is still a policy/UX task. | Brain handoff recommends `print-config` and print-don't-write. | Auto-editing Codex/Claude/Gemini config without consent would violate the brain handoff. | Cockpit/installer should show paste snippets or use an explicit user-consent gate. |

## Next Steps

1. Run targeted Tauri tests for the knowledge root contract.
2. Run the MSIX brain pin preflight path before the next package build.
3. Rebuild/reinstall the package and recapture `record-brain-product-proof.ps1`.
4. Keep cockpit recall/capture UX and autocollect expansion behind this root
   contract plus fresh package evidence.
