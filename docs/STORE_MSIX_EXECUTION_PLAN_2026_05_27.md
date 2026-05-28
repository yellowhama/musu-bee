# Store / MSIX Execution Plan — 2026-05-27

## Goal

Make `musu` genuinely Store/MSIX-ready on Windows without pretending the current direct-download bootstrap path is already equivalent.

## Phase 0 — constraints locked

Done when:

1. Official Microsoft constraints are documented.
2. Product direction is recorded as a Windows distribution pivot.
3. The repo has a written audit of the current Windows install/runtime model.

Artifacts:

- `docs/STORE_MSIX_AUDIT_2026_05_27.md`
- `docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`

## Phase 1 — runtime split

Goal:

Create a first-class distinction between:

- `direct-download`
- `store-msix`

Required outcomes:

1. Runtime mode detection exists.
2. Store mode disables self-update.
3. Store mode does not assume binaries live in `~/.musu/bin`.
4. Store mode does not rely on Task Scheduler registration.
5. CLI/bridge token loading works without requiring an external env export.

## Phase 2 — package-safe startup model

Goal:

Replace the current Windows startup model for Store builds.

Required outcomes:

1. No Store build path depends on `schtasks`.
2. Startup uses a package-aware mechanism.
3. Background execution is explicitly validated against Microsoft packaged app rules.

Open question:

- Whether MUSU uses a packaged startup task, a packaged full-trust background component, or a different Store-safe launch pattern.

## Phase 3 — package-safe data and path model

Goal:

Eliminate runtime assumptions that conflict with packaged app behavior.

Required outcomes:

1. No Store code path writes to packaged install files.
2. No Store code path depends on current working directory semantics.
3. App data/storage policy is explicit:
   - keep `~/.musu` intentionally, or
   - move to package-aware app data locations

## Phase 4 — packaging assets

Goal:

Add the actual MSIX packaging material.

Required outcomes:

1. Packaging project or equivalent manifest assets exist in repo.
2. Package identity is declared.
3. Startup/background declarations are present.
4. App execution alias strategy is decided if CLI entry is required.
5. Submission assets exist for a first Store submission.

## Phase 5 — Store surface review

Goal:

Review whether MUSU's machine-control surface is acceptable in the packaged build.

Must review:

1. RPC exec
2. PTY shell
3. WebDAV
4. file write/delete APIs
5. clipboard monitor
6. mDNS advertising
7. cloud registration + peer discovery

This phase is not only about technical packaging. It is about whether the packaged product variant is the same product, a reduced-surface product, or a staged rollout product.

## Phase 6 — thermonuclear review gate

Before declaring “Store/MSIX-ready”, do all of the following:

1. Deep code review of the Store path vs direct-download path
2. Failure-mode review of install, update, startup, and data persistence
3. Qualitative product critique:
   - trust story
   - user mental model
   - Windows-native fit
   - supportability
4. Gap list with no hand-waving
5. Finish remaining required work

Review artifacts:

- `docs/STORE_MSIX_THERMO_AUDIT_2026_05_27.md`
- `docs/STORE_MSIX_QUAL_CRITIQUE_2026_05_27.md`

## Current repo status

At this point the repo should be treated as:

- **pivot accepted**
- **audit written**
- **initial Store-mode groundwork in progress**
- **not yet Store/MSIX-ready**
