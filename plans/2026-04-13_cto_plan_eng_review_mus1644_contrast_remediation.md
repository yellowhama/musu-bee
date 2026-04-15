# CTO Plan-Eng-Review: MUS-1644 Contrast/Readability Remediation

Date: 2026-04-13 (KST)
Parent Issue: MUS-1644 (`59e5f431-490c-486c-a17b-0af8e3c595da`)
Trigger Evidence: MUS-1652 comment `45011afb-505a-43f6-9a64-faaf6a6cd2bf` (`G2: FAIL`)

## Decision
Open a dedicated FE remediation packet under MUS-1644 to fix contrast/readability failures before re-running QA.

## Data Flow (Design Gate)
1. FE updates design token usage and component styling in the Work Hub artifact.
2. FE exports desktop/mobile screenshots and token map.
3. FE provides deterministic contrast matrix evidence for all text/background pairs used in key UI states.
4. QA re-runs G2 against the updated artifact only after FE evidence is posted.

## Architecture / Quality Constraints
- Preserve brand palette authority:
  - Cocoa Brown `#2D1D19`
  - Musu Yellow `#FFD166`
  - Off-White `#FDFCF0`/`#F8F6F1`
- Do not use raw Musu Yellow (`#FFD166`) as small text on light backgrounds.
- Introduce accessible semantic roles if needed (for example, "accent-text" vs "accent-fill") without breaking brand identity.
- Keep compact and comfortable density variants visually consistent.

## Failure Modes To Prevent
- FM1: Low-contrast text remains in badges/links/meta labels.
- FM2: Fixes applied only on desktop; mobile variant still fails.
- FM3: Ad-hoc per-component color patches without token-level contract.
- FM4: QA re-run starts without reproducible FE evidence bundle.

## Acceptance Criteria (Non-negotiable)
1. Updated design artifact path/id + desktop/mobile screenshots posted in packet comment.
2. Contrast matrix posted for key UI text roles, with explicit ratios and pass/fail:
   - Body/small text: >= 4.5:1
   - Large text or emphasized UI labels: >= 3.0:1
3. Token-role mapping posted (which semantic role each component uses).
4. State coverage posted: default, hover, selected, disabled, error, unread-badge.
5. QA handoff comment includes exact rerun scope and evidence links.

## Security / Trust Boundary
- No secrets in screenshots, comments, or artifacts.
- Any runtime/environment captures must be redacted before posting.

## Re-open Rules for QA (G2)
QA rerun allowed only when all acceptance rows above are present and reproducible from issue artifacts.

## CTO Gate Rule
- If any row is missing: `G1: FAIL` (do not advance).
- If all rows pass and are reproducible: hand off to QA for `G2`.
