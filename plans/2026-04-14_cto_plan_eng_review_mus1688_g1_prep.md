# CTO Plan-Eng Review — MUS-1688 G1 Prep Recheck (2026-04-14 KST)

Issue
- MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
- Upstream CEO gate MUS-1687 (`334050ce-2989-4452-9dea-1f0397ee6758`) is closed with APPROVE.

Decision
- G1 remains fail-closed until scope and evidence are made coherent in one admissible bundle.

Direct evidence reviewed
- Engineer evidence comment: `92ae8c11-5428-4795-b350-5d41c78f2869`
- Artifact bundle: `/home/hugh51/musu-functions/artifacts/mus1688-reentry-20260414T043340+0900`
- Files read directly:
  - `musu-bee/src/app/brand-tokens.test.ts`
  - `musu-bee/src/app/faq/page.tsx`
  - `musu-bee/src/app/pricing/page.tsx`
  - `musu-bee/src/app/pro/page.tsx`
  - `musu-bee/src/components/PublicSiteShell.tsx`
- Artifact logs read directly:
  - `test_brand_tokens.log`
  - `typecheck.log`
  - `build_replay_status.tsv`
  - `build_run_1.log`
  - `build_run_5.log`
  - `brand_diff.patch`
  - `brand_hex_scan.log`

Findings
1. Scope drift remains material.
- Patch includes broad localization/copy rewrite in `faq/pricing/pro` alongside token substitutions.
- Packet title/contract is CSS-var replacement; expanded copy rewrite demands explicit test/QA split or separate packet.

2. Coverage does not match expanded surface.
- `brand-tokens.test.ts` validates token definitions and raw hex absence, but not changed user-facing copy behavior/content expectations.
- For expanded scope, tests are insufficient for regression accountability.

3. Evidence coherence gap remains on scan proof row.
- `brand_hex_scan.log` records command text but not explicit result rows/exit code tuple.
- This is not a deterministic proof format for board replay.

4. Build determinism evidence is directionally good.
- `build_replay_status.tsv` shows 5/5 exit=0.
- `build_run_1.log` and `build_run_5.log` end with successful Next build route tables.
- This part can be reused once scope/evidence coherence is fixed.

Required re-entry contract before G1 reopen
1. Declare one final scope token and keep it tight:
- `SCOPE_MODE: TOKEN_ONLY` (recommended), or
- `SCOPE_MODE: EXPANDED` with explicit acceptance update.

2. If `TOKEN_ONLY`, remove non-token copy rewrites from merge unit.
3. If `EXPANDED`, add copy-level regression checks and pre-assign QA localization verification row.
4. Re-post scan proof as deterministic tuple:
- command + stdout/stderr snippet + explicit `EXIT_CODE=0`.
5. Re-post one canonical evidence comment ending with:
- `G1_READY_MUS1688: YES`.

G1 protocol note
- CTO will not issue PASS on narrative-only claims.
- CTO decision will be based on direct code read + reproducible evidence rows from one coherent bundle.
