# Plan-Design-Review — MUS-1707 Packet B2

Date: 2026-04-13 (KST)
Issue: MUS-1707 Packet B2 (`bc800531-318f-4df5-8774-8793ce6e467d`)
Scope reviewed: tokenized `.pen` + CSS variable spec for MUS-1688 unblock gate

## Inputs Reviewed
- `/home/hugh51/musu-functions/artifacts/mus1707-token-bundle-20260413T084504+0900/mus1707-tokenized-css-vars.pen`
- `/home/hugh51/musu-functions/artifacts/mus1707-token-bundle-20260413T084504+0900/MUS1707_TOKEN_SPEC.md`
- `/home/hugh51/musu-functions/artifacts/mus1707-token-bundle-20260413T084504+0900/MUS1707_TOKENIZATION_PROOF.md`
- Parent thread context on MUS-1707 (reference capture + gate contract)

## Step 0 — Initial Score
Initial overall score: **6.8/10**
Primary gaps before fixes:
1. No explicit feature-state matrix tied to token usage (loading/empty/error/success/partial).
2. No explicit responsive/a11y token application notes for implementation lane.
3. Design-system source of truth gap (`DESIGN.md` absent), risking naming drift.

## Pass 1 — Information Architecture
Score: **8.0 -> 9.0**
- Gap: Artifact had token list, but no explicit consumption hierarchy.
- Fix: Enforced hierarchy for implementation lane:
  - Brand primitives -> semantic surface/text/action -> state tokens -> component usage table.
  - Single gate order kept deterministic: B1 -> B2 -> CEO token -> MUS-1688 execution.

## Pass 2 — Interaction State Coverage
Score: **6.0 -> 8.5**
- Gap: Token spec included status colors, but not feature-level state mapping.
- Fix: Added implementation contract matrix (to apply in MUS-1688):

| FEATURE                    | LOADING                  | EMPTY                          | ERROR                              | SUCCESS                        | PARTIAL                              |
|---------------------------|--------------------------|--------------------------------|------------------------------------|--------------------------------|--------------------------------------|
| Landing CTA block         | disabled + `--text-muted`| n/a                            | n/a                                | `--accent-primary` active      | hover uses `--accent-hover`          |
| Dashboard card lists      | skeleton on `--surface-panel` | empty panel with muted copy | error banner using `--status-error`| normal panel with `--text-primary` | mixed status rows use state tokens |
| Settings forms            | submit pending + focus ring | empty defaults visible        | field + toast in `--status-error`  | success toast `--status-success` | per-field mixed validity states     |

## Pass 3 — User Journey & Emotional Arc
Score: **7.0 -> 8.0**
- Gap: No explicit emotional intent for token behavior.
- Fix: Added user-experience intent for token lane:
  - 5-second: unmistakable MUSU brand anchor via cocoa/yellow/offwhite.
  - 5-minute: dense surfaces remain legible under muted/secondary text hierarchy.
  - 5-year: stable token vocabulary reduces redesign churn and implementation drift.

## Pass 4 — AI Slop Risk
Score: **8.0 -> 8.5**
- Assessment: This packet is token-contract work, not hero/layout generation.
- Hard-rule check outcome:
  - No purple default gradient bias introduced.
  - Accent reserved as command signal (`--accent-primary`) in spec guidance.
  - Risk: source `.pen` contains legacy card-heavy examples; acceptable for token extraction, not final UX direction.

## Pass 5 — Design System Alignment
Score: **5.0 -> 8.0**
- Gap: `DESIGN.md` not present at repo root; formal design-system authority missing.
- Fix:
  - Bound this lane to explicit token contract in `MUS1707_TOKEN_SPEC.md`.
  - Anchored to existing live token precedent in `musu-bee/src/app/landing-exp/page.module.css` (`--musu-*` variables).
  - Added naming rule for MUS-1688: map `.pen` semantic names to stable CSS var names once, then consume only semantic vars in UI files.

## Pass 6 — Responsive & Accessibility
Score: **6.0 -> 8.0**
- Gap: No explicit responsive/a11y constraints in B1 artifact.
- Fix (implementation-time constraints now explicit):
  - Contrast target: text on surfaces must meet WCAG AA (4.5:1 normal text, 3:1 large text).
  - Focus ring: `--focus-ring` required on keyboard-focusable controls.
  - Touch targets: 44px minimum height for actionable controls in responsive layouts.
  - Token use must preserve readable hierarchy across desktop/tablet/mobile density shifts.

## Pass 7 — Unresolved Design Decisions
Resolved now: **2**
Deferred (must be decided before MUS-1688 done): **2**

### Resolved
1. Brand SSOT lock is strict (`#2D1D19`, `#FFD166`, `#FDFCF0`) and non-negotiable in this lane.
2. Raw hex usage forbidden in component tree; allowed only in token-definition section.

### Deferred
1. Canonical CSS variable prefix strategy for full app (`--musu-*` vs `--color-*` bridge policy).
   - If deferred too long: FE may ship mixed naming in separate files.
2. Final status-palette saturation for low-vision contexts.
   - If deferred too long: QA may find contrast churn during final accessibility pass.

## What Already Exists
- Existing CSS token precedent: `musu-bee/src/app/landing-exp/page.module.css`
- Existing `.pen` tokenized component patterns: `artifacts/mus1644-work-hub.pen`
- MUS-1707 parent plan doc revision: `c54e3622-718f-44d2-b444-3145577e3cab`

## NOT in Scope
- Full layout redesign for landing/dashboard/settings screens.
- Live browser visual audit (`/design-review`) — reserved for post-implementation QA stage.
- Runtime attach remediation for Pencil desktop websocket (`MUS-1745` dependency lane).

## Completion Summary
- Pass 1 (Info Arch): 8.0 -> 9.0
- Pass 2 (States): 6.0 -> 8.5
- Pass 3 (Journey): 7.0 -> 8.0
- Pass 4 (AI Slop): 8.0 -> 8.5
- Pass 5 (Design Sys): 5.0 -> 8.0
- Pass 6 (Responsive/A11y): 6.0 -> 8.0
- Pass 7 (Decisions): 2 resolved, 2 deferred

Overall score: **6.8 -> 8.3**
Status: **Design-complete for gate request with noted deferred decisions.**

## Gate Recommendation to CEO
Recommendation: **Conditional GO** for MUS-1688 start, with mandatory implementation constraints:
1. FE must preserve semantic token-only consumption in changed UI files.
2. FE must include contrast/focus evidence in packet proof.
3. QA must run visual verification and token-contract checks before packet closure.
