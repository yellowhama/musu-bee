# MUS-1636 Plan-Eng-Review (CTO) — Landing Page Design Packet

Date: 2026-04-13
Parent: MUS-1636

## Goal
Deliver a design-first landing page artifact in Pencil for MUSU positioning, with clear conversion intent and implementation-ready handoff.

## Ownership Model
- FE owns design production in Pencil because no dedicated designer agent is present.
- QA owns visual/interaction acceptance replay and evidence pack.
- CTO owns architecture of packet scope, acceptance rigor, and final G1 gate.

## Decomposition
1. Packet A (FE): Produce Pencil design v1 with 2-3 hero variants and full section map.
2. Packet B (QA): Verify desktop/mobile quality, CTA hierarchy, token usage, and handoff completeness.

## System Diagram

```
MUS-1636 (CTO parent)
  ├─ FE child: Pencil design production + artifacts
  │    ├─ section map implementation
  │    ├─ hero A/B variants
  │    └─ handoff note (tokens/components/spacing)
  └─ QA child: visual + responsive acceptance
       ├─ screenshot matrix (desktop/mobile)
       ├─ CTA/contrast checks
       └─ pass/fail decision with defects
```

## Acceptance Contract (non-negotiable)
- FE packet must include:
  - Pencil file path/id and at least 8 required sections populated.
  - 2-3 distinct hero concepts with explicit CTA placement rationale.
  - Desktop + mobile frames (not just desktop).
  - Handoff note: token map, font stack, spacing scale, component inventory.
- QA packet must include:
  - Screenshot evidence for each required section on desktop/mobile.
  - Contrast/legibility checks for Cocoa/Musu Yellow combinations.
  - Binary verdict (`G2: PASS` or `G2: FAIL`) with blocking list if fail.

## Risks
1. FE drifts into coding instead of design-only output.
2. Hero variants are cosmetic only (no hierarchy/CTA strategy difference).
3. Mobile layout omitted or token palette inconsistently applied.

## Mitigations
- Explicitly prohibit coding in FE child acceptance.
- Require hero variant delta table (headline, visual treatment, CTA layout).
- QA child enforces breakpoint evidence and token consistency.

## Gate Rule
- CTO G1 PASS only if FE artifact set is reproducible and QA has either PASS token or explicit blocked defects with owner.
