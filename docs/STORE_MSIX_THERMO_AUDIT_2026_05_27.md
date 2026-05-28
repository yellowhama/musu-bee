# Thermo-Nuclear Audit — Store / MSIX Path

## Verdict

REQUEST_CHANGES

The repo is materially better than it was at the start of the pivot. The local/manual packaged contract is now proven enough to stand on its own. The hard blocker has moved outward: Microsoft account verification and restricted-capability review are now the real completion gate for the Store-reviewed auto-start path.

## Blockers (1)

- [docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md:1) / [scripts/windows/prepare-store-submission-bundle.ps1](F:/workspace/musu-bee/scripts/windows/prepare-store-submission-bundle.ps1:1) / [docs/STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md:1) — completion gate — the remaining blocker is now external Microsoft approval, not missing repo-local packaging proof. Concrete fix: finish Partner Center company/employment verification, submit the prepared Store-reviewed bundle, and record the certification result back into the repo.

## Strong Suggestions (3)

- [musu-rs/src/install/cli_commands.rs](F:/workspace/musu-bee/musu-rs/src/install/cli_commands.rs:147) — giant-file pressure — the file is still large and mixes share commands, file-transfer commands, workflow commands, pairing, auth, and bridge URL discovery. Concrete fix: split it by command domain (`fleet`, `files`, `pairing`, `auth`) and leave only clap wiring/shared helpers in `cli_commands.rs`.
- [scripts/windows/build-msix.ps1](F:/workspace/musu-bee/scripts/windows/build-msix.ps1:1) — duplicated PowerShell utility layer — repo-root discovery and output-path conventions are now centralized, but `build-msix.ps1` still carries its own helper stack while the other MSIX scripts source a common helper module. Concrete fix: move the remaining shared path/manifest/archive helpers into `msix-common.ps1` and keep `build-msix.ps1` focused on packaging orchestration.
- [musu-rs/src/bridge/mod.rs](F:/workspace/musu-bee/musu-rs/src/bridge/mod.rs:203) — mixed responsibilities — bridge boot still owns cloud registration, mDNS advertiser startup, peer cache persistence, and packaged-port advertisement logic in one function. Concrete fix: extract a `bridge::presence` or `bridge::discovery_runtime` module that owns registration/peer-cache refresh as a separate unit with direct tests.

## Nits (2)

- [musu-rs/src/bridge/services.rs](F:/workspace/musu-bee/musu-rs/src/bridge/services.rs:25) — the new local-bridge helpers are the right direction, but the file is becoming both a registry abstraction and a runtime URL policy module. If more URL policy lands here, rename or split the module.
- [scripts/windows/run-msix-workflow.ps1](F:/workspace/musu-bee/scripts/windows/run-msix-workflow.ps1:1) — the workflow runner is fine for local iteration, but once install/startup proof exists it should emit a small machine-readable summary artifact rather than only host output.

## Mechanical Findings

- Files > 1000 lines in the reviewed Store/MSIX path: none.
- Largest touched source file in scope: [musu-rs/src/install/cli_commands.rs](F:/workspace/musu-bee/musu-rs/src/install/cli_commands.rs:1) at ~850 lines.
- Thin wrappers removed/centralized in this pass:
  - local bridge URL fallback now lives in [musu-rs/src/bridge/services.rs](F:/workspace/musu-bee/musu-rs/src/bridge/services.rs:242)
  - PowerShell MSIX manifest/package inspection now lives in [scripts/windows/msix-common.ps1](F:/workspace/musu-bee/scripts/windows/msix-common.ps1:1)
- Cast bloat: none introduced in the reviewed path.
- Duplicated branching reduced in this pass:
  - local bridge URL resolution was consolidated from CLI/control/cloud registration helpers
  - PowerShell package identity parsing was consolidated from multiple scripts

## Resolved In This Pass

- [musu-rs/src/bridge/mod.rs](F:/workspace/musu-bee/musu-rs/src/bridge/mod.rs:215) — canonical ownership — cloud registration now uses the same advertised bridge URL helper as the rest of the runtime instead of rebuilding the URL inline.
- [musu-rs/src/bridge/mod.rs](F:/workspace/musu-bee/musu-rs/src/bridge/mod.rs:283) — correctness bug — peer discovery no longer rewrites a remote Tailscale peer to the local bridge port; it preserves the remote public URL port.
- [scripts/windows/msix-common.ps1](F:/workspace/musu-bee/scripts/windows/msix-common.ps1:1) — duplication — package identity / archive inspection is no longer copied across `install-msix`, `verify-msix-package`, `check-msix-sideload-readiness`, and `verify-installed-msix-package`.
- [scripts/windows/install-and-verify-msix.ps1](F:/workspace/musu-bee/scripts/windows/install-and-verify-msix.ps1:1) — contract honesty — local sideload is no longer graded as an auto-start failure. It is explicitly treated as a packaged manual-bridge contract.
