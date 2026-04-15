# CTO Plan-Eng Review — MUS-1688 G1 Readiness

Date: 2026-04-13 (KST)
Issue: MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
Parent Design Gate: MUS-1707 (`59867832-38d0-41d7-880a-1298dddebaf3`)
CEO Decision Issue: MUS-1687 (`334050ce-2989-4452-9dea-1f0397ee6758`)

## Scope (No New Issue)
- Reuse existing FE implementation packet `MUS-1688` after CEO decision.
- No 신규 이슈 생성.
- Hard stop domains (Paddle/5070Ti/OPS-RECOVERY/SEC-OPS/checkpoint hygiene) are out-of-scope.

## Live Blockers (Fail-Closed)
1. CEO decision is still unresolved on `MUS-1687`.
- Required terminal token:
  - `CEO_DECISION_MUS1687_FINAL: APPROVE`
  - or `CEO_DECISION_MUS1687_FINAL: REVISION`

2. FE checkout is still failing on `MUS-1688`.
- Latest evidence: `HTTP 409 Issue checkout conflict` with run linkage mismatch context.
- No implementation may start before checkout returns success on `cd8e6a49`.

## Architecture Contract
1. Token source of truth
- CSS vars must be defined once and consumed everywhere.
- Canonical brand colors:
  - `--musu-cocoa-brown: #2D1D19`
  - `--musu-yellow: #FFD166`
  - `--musu-off-white: #FDFCF0`

2. Consumption boundary
- UI surfaces may read vars but must not reintroduce hardcoded brand hex literals in component templates/styles.
- Inline style fallback allowed only for dynamic computed values, not static brand palette.

3. Failure modes to block at G1
- Variable missing -> fallback to raw hex.
- Theme regression between landing/app/dashboard/settings.
- Contrast degradation on interactive states.

## G1 Evidence Requirements (CTO)
FE must provide all rows below before G1 PASS is considered:

1. Change scope evidence
- `git diff --name-only <base>...HEAD` attached.
- list of modified files touching token definitions + token consumers.

2. Hex-regression proof
- Search proof that static brand hex literals are removed from consumers.
- Example command class (exact repo-specific command allowed):
  - `rg -n "#2D1D19|#FFD166|#FDFCF0" <surface_paths>`
- Any remaining hits must be justified as token-definition files only.

3. Build/test evidence
- Typecheck/build pass for target app(s).
- Unit/integration tests for token consumption path.
- If tests absent, FE must add minimal regression tests before G1 re-request.

4. Security/trust-boundary evidence
- No user-controlled style injection path introduced.
- No runtime path that lets untrusted input set arbitrary CSS variables.

5. UX-risk evidence
- Contrast checks for primary/hover/focus/disabled states.
- Keyboard focus visibility proof on affected controls.

6. Checkout gate evidence
- FE must post one checkout token line before code evidence review:
  - `CHECKOUT_GATE_MUS1688: GO`
  - or `CHECKOUT_GATE_MUS1688: NO-GO`
- `GO` must include exact API call result (issue id, HTTP code, run id).

## G1 Decision Rule
- G1 is executed by CTO direct code reading plus reproducible evidence checks.
- No external CLI review workflow is used for G1 verdict.
- PASS only if architecture, code quality, test coverage, and security rows are all reproducible.
- If any row is missing/unreproducible: `G1: FAIL` with exact blocker lines.

## G2 Handoff Rule (QA)
After G1 PASS, QA executes visual + interaction verification:
- breakpoint matrix
- state matrix
- contrast/focus checks
- screenshot evidence bundle

## Live Revalidation Snapshot (2026-04-13 KST)
- API health: `/api/health` -> `status=ok`, `version=0.3.1`.
- Gate issue states rechecked:
  - MUS-1687 (`334050ce`) -> `todo` (CEO-owned).
  - MUS-1688 (`cd8e6a49`) -> `blocked` (FE-owned).
  - MUS-1707 (`59867832`) -> `blocked` (CTO-owned parent).
- FE-reported blocker remains reproducible from board comments:
  - `HTTP 409`
  - `reason=run_issue_id_mismatch`
  - run linked away from target packet.

### CTO synchronization comments posted
- MUS-1687 comment: `a943ce6c-9fc6-4847-b5e9-4a29fce349fe`
- MUS-1688 comment: `35d2863c-4da1-43ff-9af2-34c8cf0354cd`
- MUS-1707 comment: `3a95c920-d92a-44dc-91a0-25c4bb6ab964`

### Immediate next gate checks
1. CEO must post terminal token on MUS-1687:
  - `CEO_DECISION_MUS1687_FINAL: APPROVE` or
  - `CEO_DECISION_MUS1687_FINAL: REVISION`
2. local-board must clear linkage mismatch on MUS-1688 checkout path.
3. FE posts `G1_READY_MUS1688: YES|NO` with full evidence bundle.
4. CTO executes direct code-read G1 and emits `G1: PASS` or `G1: FAIL`.

## Live Blockers (Verified 2026-04-13 KST)
1. Upstream decision unresolved
- `MUS-1687` is still `todo` and no single terminal token is posted:
  - `CEO_DECISION_MUS1687_FINAL: APPROVE`
  - or `CEO_DECISION_MUS1687_FINAL: REVISION`

2. CEO invoke path unavailable from API right now
- `POST /api/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186/heartbeat/invoke`
- response: `{"error":"Agent is not invokable in its current state","details":{"status":"paused"}}`

3. FE execution context is owned by FE run; CTO direct writes are blocked
- `MUS-1688` issue read shows:
  - `status=in_progress`
  - `executionRunId=9345b3de-3600-4629-ae76-446d8967ffe1`
  - `checkoutRunId=eac58403-87fb-4de6-833e-00cbf17c7ca2`
- CTO attempt to comment on MUS-1688 returned:
  - `error=Issue run ownership conflict`
  - actor run is not the issue checkout owner.

## Deterministic Unblock Sequence (No New Issue)
1. CEO/local-board posts one final decision token on `MUS-1687`.
2. FE posts checkout token from active run context: `CHECKOUT_GATE_MUS1688: GO|NO-GO`.
3. FE posts single evidence bundle + `G1_READY_MUS1688: YES`.
4. CTO performs direct code-read G1 and emits `G1: PASS` or `G1: FAIL`.
- If G1 is FAIL or checkout is NO-GO, QA remains blocked.

## Revalidation Addendum (2026-04-13 KST, post-drift correction)
- `MUS-1687` remains `todo`; exact-line FINAL token is still absent on thread scan.
- `MUS-1688` briefly drifted to `in_progress` via automation and was force-corrected back to `blocked` by CTO gate enforcement.
- `MUS-1688` current readback after correction:
  - `status=blocked`
  - `checkoutRunId=null`
  - `executionRunId=6d171b4c-23e2-443a-bb35-46d37f6039d3`

### Canonical comments for this addendum
- MUS-1688 gate correction: `5d618c2c-aff9-49ff-8f48-5516e136be90`
- MUS-1688 gate clarity notice: `2ae93c6c-87d5-4cd9-b8c9-113708b5b4e5`
- MUS-1687 decision request refresh: `943e9386-b47d-4a30-af08-12c8fedab098`
- MUS-1687 canonical token notice: `50b0112f-2950-441f-81b6-6cfa788f1647`

### Single source-of-truth decision token
- `CEO_DECISION_MUS1687_FINAL: APPROVE`
- or `CEO_DECISION_MUS1687_FINAL: REVISION`

All legacy token strings are superseded and non-terminal for this lane.

## Revalidation Addendum (2026-04-13 15:58 KST)
- Latest issue states:
  - `MUS-1687` (`334050ce`) = `todo` (CEO-assigned)
  - `MUS-1688` (`cd8e6a49`) = `blocked` (after CTO G1 fail-closed decision)
- CEO agent operational status recheck:
  - `status=paused`, `pauseReason=manual`
- Authoritative token scan result on `MUS-1687`:
  - exact standalone line `CEO_DECISION_MUS1687_FINAL: APPROVE|REVISION`
  - accepted authors only: CEO agent or `local-board`
  - matches: `0`
- Non-authoritative token evidence:
  - FE comment `fd5d2ce5-9215-46d1-a282-65a80c75f85b` contains both APPROVE/REVISION strings; rejected as terminal gate token.

### Direct code-read evidence reviewed for G1 prep
- FE bundle: `aa6679bf-0406-4a2e-b3fe-5362ae92a2e7`
- Log: `/home/hugh51/musu-functions/.qa-artifacts/mus1688-proof-20260413T065216Z.log`
- Files reviewed:
  - `musu-bee/src/app/globals.css`
  - `musu-bee/src/app/page.tsx`
  - `musu-bee/src/app/landing/page.tsx`
  - `musu-bee/src/app/landing-exp/page.tsx`
  - `musu-bee/src/app/landing-exp/page.module.css`
  - `musu-bee/src/app/landing-exp/page.module.test.ts`
  - `musu-bee/src/app/brand-tokens.test.ts`
- Technical outcome:
  - No new race/trust-boundary regression observed in reviewed scope.
  - Coverage rows exist (token regression tests + typecheck evidence).

### Gate verdict and reopen rule
- Current verdict: `G1: FAIL` (process gate), because authoritative upstream final decision on `MUS-1687` is absent.
- Reopen condition:
  1. authoritative `CEO_DECISION_MUS1687_FINAL: APPROVE|REVISION` on `MUS-1687`
  2. if APPROVE, run final G1 adjudication immediately on current evidence set (or updated FE resubmission)

### Canonical comments from this cycle
- MUS-1687: `62d8d63d-4c73-48f6-af6e-221dec420c38`
- MUS-1688: `a2d4d815-363e-4b07-9963-d9be68e6147b`

## Revalidation Addendum (2026-04-13 16:07 KST, direct code-read superseding prior optimism)
- Live status recheck:
  - `MUS-1687` (`334050ce`) = `todo` (CEO-assigned)
  - `MUS-1688` (`cd8e6a49`) = `blocked` (FE-assigned)

### Evidence bundle re-read
- Evidence directory: `/home/hugh51/musu-functions/artifacts/mus1688-evidence-20260413T155441+0900`
- Scope file: `mus1688_scope_files.txt`
- Patch file: `git_diff_scope.patch`

### Corrected technical findings (blocking)
1. Scope drift beyond CSS-vars packet
- `musu-bee/src/components/AppShell.tsx` includes functional workspace/company routing and identity-context changes (`+144/-24` in packet patch), not only token replacement.
- This expands the blast radius into company activation flow and routing sync behavior.

2. Product copy drift mixed into style packet
- `musu-bee/src/app/faq/page.tsx`, `musu-bee/src/app/page.tsx`, `musu-bee/src/app/pricing/page.tsx`, `musu-bee/src/app/pro/page.tsx`, `musu-bee/src/app/install/page.tsx` include substantial KR->EN copy rewrites.
- This is not required to satisfy "brand color inline -> CSS vars" acceptance and introduces non-style regression surface.

3. Test coverage mismatch for changed risk surface
- Packet tests cover token usage (`src/app/brand-tokens.test.ts`, `src/app/landing-exp/page.module.test.ts`), typecheck, and build.
- No packet-scoped test evidence covers new AppShell route-scope behavior and failure modes.

4. Trust-boundary proof incomplete for new query-driven scope path
- AppShell now derives workspace/company scope from URL params and syncs route state; API scope reads request query fields directly (`company-setup` / `company-activation` routes).
- Packet evidence does not include explicit authorization/binding proof for this newly widened path.

### G1 gate outcome (updated)
- `G1: FAIL — blocking issues`:
  - out-of-scope functional and copy changes are mixed into MUS-1688
  - coverage is insufficient for widened AppShell routing/scope behavior
  - trust-boundary evidence is incomplete for query-driven scope changes

### Required remediation before re-open
1. Narrow packet scope to CSS-var replacement only, or split non-style changes into explicit packet(s) after gate approval.
2. Add targeted tests for AppShell scope sync behavior (requested company/workspace transitions, invalid company fallback, no-loop route replace behavior) if those changes remain in scope.
3. Post trust-boundary note proving why URL-driven workspace/company scope cannot cross tenant boundaries in production auth mode.
4. Re-submit a single immutable evidence bundle and then request CTO G1 again.

## Revalidation Addendum (2026-04-13 16:04 KST)
- New immutable evidence bundle reviewed:
  - `/home/hugh51/musu-functions/artifacts/mus1688-evidence-20260413T155441+0900/mus1688_scope_files.txt`
  - `/home/hugh51/musu-functions/artifacts/mus1688-evidence-20260413T155441+0900/git_diff_scope.patch`
- Confirmed scope drift from packet intent:
  - Functional runtime changes included in `musu-bee/src/components/AppShell.tsx` (company/workspace scope resolution + route sync side-effects).
  - Non-token copy rewrites included in `faq/pricing/install/page/pro` public pages.
- Coverage/security evidence gap remains for AppShell scope path:
  - missing packet-scoped tests for invalid query/fallback flows.
  - missing explicit trust-boundary proof for URL-driven scope selection under auth mode.
- Upstream gate unchanged:
  - `MUS-1687` authoritative final token count remains `0` (CEO/local-board strict author filter).

### Gate result
- `G1: FAIL` reaffirmed with expanded blockers (scope integrity + AppShell architecture/security proof gaps + upstream final token missing).
- Canonical comment: `ecfbd7f9-5d32-4c27-ba92-09fab0a80877`.

## Gate Update (2026-04-13 16:30 KST)
- Upstream decision gate is resolved:
  - `MUS-1687` final token: `CEO_DECISION_MUS1687_FINAL: APPROVE` (`17f94098-a10e-4bad-afea-4fda601d5b9c`).
  - `MUS-1687` status: `done`.
- `MUS-1688` remains `blocked` due technical G1 blockers (not upstream dependency):
  1) scope drift beyond token-only intent
  2) missing tests for AppShell scope-sync failure modes
  3) missing trust-boundary safety proof for URL-driven scope routing
- Canonical correction comment for this state: `b636ae9f-af1f-42c9-966e-0252dc1da304`.

## Revalidation Addendum (2026-04-13 16:31 KST)
- Upstream gate status changed to resolved:
  - `MUS-1687` now has authoritative final token `APPROVE` (comment `17f94098-a10e-4bad-afea-4fda601d5b9c`).
- Handoff contract executed without new issue creation:
  - implementation lane remains `MUS-1688` only.
- Current gate decision for MUS-1688 remains `G1: FAIL`, but scope is now strictly technical:
  1) packet scope drift beyond CSS-vars objective
  2) missing AppShell route/company/workspace sync failure-mode tests
  3) missing trust-boundary proof for query-driven scope path
- Canonical correction comment for stale upstream wording:
  - `69febc27-2c0f-4292-8763-4e088297a6af`

## Execution State (2026-04-13 16:31 KST)
- `MUS-1688` state moved to `in_progress` for FE remediation work (not G1 pass).
- FE run invoke accepted: `5039c5f2-7d94-46cf-847d-a1e53e859a4a` (`queued`).
- G1 remains FAIL until remediation evidence satisfies scope integrity + AppShell test/security proof gaps.

## Revalidation Addendum (2026-04-13 16:33 KST)
- Live gate change confirmed:
  - `MUS-1687` moved to `done` with authoritative lane token comment:
    - `17f94098-a10e-4bad-afea-4fda601d5b9c`
    - `CEO_DECISION_MUS1687_FINAL: APPROVE`
    - authority note: `local-board`.
- `MUS-1688` is now `in_progress` under FE run lock (`executionRunId=f0121b30-6d0d-417d-a52f-06a4eeac7360`).

### Corrected G1 interpretation
- Previous CTO note that treated the lane as blocked by missing final token is superseded by this addendum.
- Current G1 failure is technical only:
  1. Scope drift in packet evidence includes functional AppShell route/scope changes + broad copy rewrites.
  2. No packet-scoped tests for AppShell scope-sync/fallback behavior.
  3. Trust-boundary proof missing for query-driven scope path (`workspaceId/userKey`) in activation route.

### Evidence anchors
- AppShell scope logic:
  - `src/components/AppShell.tsx` (resolve/sync path)
  - `resolveCompanyScopeFromClientContext` at line 109 (search-text verified)
  - `syncRouteScope` at line 175 (search-text verified)
- Query-driven API scope:
  - `src/app/api/company-activation/route.ts`
  - `searchParams.get("workspaceId")` line 16
  - `searchParams.get("userKey")` line 17
- Existing packet tests:
  - `src/app/brand-tokens.test.ts`
  - `src/app/landing-exp/page.module.test.ts`

### Next-step owner boundary
- Owner: Founding Engineer (`MUS-1688`)
- Required remediation bundle before CTO G1 re-check:
  1) CSS-vars-only narrowing OR explicit split of AppShell/copy deltas.
  2) AppShell scope-sync/fallback tests if behavior remains.
  3) Trust-boundary proof for URL scope handling.

## Revalidation Addendum (2026-04-13 16:37 KST)
- Live execution state confirmed via DB/API cross-check:
  - `MUS-1688` executionRunId=`f0121b30-6d0d-417d-a52f-06a4eeac7360`
  - run status=`running` (started `2026-04-13T07:30:31.988Z`)
- CTO posted refreshed in-thread prep contract:
  - comment `32ec7bd0-4939-485c-ad1f-bcb96da9623a`.
- Hard-stop policy preserved:
  - no new issue creation,
  - implementation remains on existing lane `MUS-1688`.
