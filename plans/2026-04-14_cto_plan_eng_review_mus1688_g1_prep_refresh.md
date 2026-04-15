# CTO Plan-Eng Review Prep — MUS-1688 G1

Date: 2026-04-14 (KST)
Issue: MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
Upstream gate: MUS-1687 (`334050ce-2989-4452-9dea-1f0397ee6758`) = `done` with `CEO_DECISION_MUS1687_FINAL: APPROVE`

## Intent
Prepare a strict, reproducible G1 review packet for MUS-1688.
This document is a preparation contract only and is not a G1 PASS.

## Architecture Focus (G1)
Target architecture boundary for this packet:
- brand token source (`globals.css` and token vars)
- token consumption paths in required public surfaces
- no trust-boundary expansion (no user-controlled style injection path)

Required route surfaces for proof:
- `/landing`
- `/pricing`
- `/pro`
- `/faq`
- `/install`

## Failure Modes To Block
1. Scope contamination: backend/auth/payment/runtime edits mixed into a style packet without explicit blast-radius contract.
2. Non-reproducible evidence: split artifact bundles, inconsistent start/probe logs, missing deterministic command exits.
3. Token leakage: raw brand literals (hex or rgb/rgba) left in required surfaces.
4. Coverage gap: changed files not mapped to tests/proof rows.

## Required FE Re-entry Bundle (single coherent comment)
1. `REENTRY_SCOPE_MUS1688: TOKEN_ONLY|CODE_CHANGED`
2. Canonical SHA tuple (base + ordered commit list)
3. Exact changed-file list (one path per line)
4. Diff evidence pointers per file (hunk or patch+map)
5. Per-file risk tags: `trust-boundary|concurrency|build-surface|none`
6. File-to-proof mapping (`file -> command/test/probe`)
7. Deterministic replay rows with exit codes:
   - `npm run typecheck`
   - `rm -rf .next && NODE_ENV=production npm run build`
   - targeted token tests
8. Token compliance scans:
   - no raw brand hex in required surfaces
   - no raw brand rgb/rgba literals in required surfaces
9. Route-probe tuple from one coherent server start process
10. Terminal token: `G1_READY_MUS1688: YES`

## G1 Decision Rule
- Any missing or non-reproducible row => `G1: FAIL`.
- All rows reproducible with direct code-read alignment => `G1: PASS`, then QA G2 handoff.

## No-New-Issue Constraint
- Keep execution on existing implementation issue `MUS-1688` only.
- No 신규 implementation issue creation for this lane.
