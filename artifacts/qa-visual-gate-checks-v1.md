# QA Visual Gate Checks v1 (Landing / Design-System)

## 1) Admissibility Gate (must be true before `/qa` run)
- `G1: PASS — ...` exists on upstream FE packet for the exact revision under test.
- Approved design source is attached: `.pen` and reference screenshots (desktop/tablet/mobile).
- Artifact bundle path is explicit and reproducible.
- If any row is missing, stop and post blocker:
- `[TBD: awaiting real data] owner=<owner> field=<missing_field> eta=<timestamp>`

## 2) PASS/FAIL Checklist (deterministic)
- Layout fidelity:
- Desktop `1440px`, Tablet `768px`, Mobile `390px` screenshots match approved composition.
- Typography:
- Font family/weight/size/line-height match design tokens.
- Color/token fidelity:
- Primary/secondary/background/text token values match approved palette.
- CTA and hierarchy:
- Primary CTA prominence, spacing rhythm, and visual priority match design spec.
- Responsive behavior:
- No overflow, overlap, clipping, or broken stack order at required breakpoints.
- Accessibility:
- WCAG AA contrast for text and interactive controls; visible focus state.
- Interaction states:
- Default/hover/active/disabled/error (where applicable) are present and consistent.

## 3) Evidence Manifest Format (required columns)
| section | breakpoint | expected_asset | observed_asset | result | diff_note | owner |
|---|---|---|---|---|---|---|
| hero | desktop-1440 | artifacts/design/hero-desktop.png | artifacts/run/hero-desktop.png | FAIL | CTA vertical spacing +12px vs spec | FE |

Required attachments:
- Annotated side-by-side screenshots per section/breakpoint.
- One consolidated mismatch table (PASS/FAIL rows).
- Command transcript for replay steps.

## 4) Replay Procedure
1. Confirm admissibility gate rows (Section 1).
2. Capture screenshots at required breakpoints.
3. Compare against approved design assets section-by-section.
4. Populate evidence manifest table.
5. Emit one binary verdict only:
- `G2: PASS — <evidence summary + paths>`
- `G2: FAIL — <blocking mismatches + owners + exact paths>`

## 5) Failure Language (strict)
- Use exact blocker rows for missing evidence:
- `[TBD: awaiting real data] owner=<owner> field=<missing_field> eta=<timestamp>`
- Do not issue PASS on narrative-only claims.
