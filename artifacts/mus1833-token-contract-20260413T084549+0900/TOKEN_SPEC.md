# MUS-1707 Token Contract (B1a)

Date: 2026-04-13 (KST)
Issue: MUS-1833
Parent: MUS-1707

## 1) Brand SSOT (Base Tokens)

| Token | Value | Source |
|---|---|---|
| `--color-brand-cocoa` | `#2D1D19` | Musu Cocoa Brown |
| `--color-brand-yellow` | `#FFD166` | Musu Yellow |
| `--color-bg-offwhite` | `#FDFCF0` | Off-White background |
| `--color-logo-offwhite` | `#F8F6F1` | Off-White logo variant |

## 2) Semantic Tokens (Default Theme)

| Token | Value | Intent | Allowed Surfaces |
|---|---|---|---|
| `--surface-app` | `var(--color-bg-offwhite)` | App-level background | `body`, root shells |
| `--surface-panel` | `#FFFFFF` | Primary panel background | cards, panels |
| `--surface-elevated` | `#FFF9EC` | Elevated/selected background | active nav, highlighted blocks |
| `--text-primary` | `var(--color-brand-cocoa)` | Primary readable text | headings/body |
| `--text-muted` | `#6B5A56` | Secondary metadata text | timestamps/hints |
| `--text-on-accent` | `#241611` | Text on yellow accents | buttons/chips |
| `--accent-primary` | `var(--color-brand-yellow)` | Primary action accent | CTA/button fills |
| `--accent-hover` | `#FFC94D` | Accent hover/active | hover states |
| `--border-subtle` | `#E9DFC8` | Structural borders | dividers/inputs |
| `--border-strong` | `#C9B898` | Strong emphasis border | focused/selected groups |
| `--focus-ring` | `#B8860B` | Keyboard focus visibility | focus outlines |

## 3) State Tokens

| Token | Value | State Use |
|---|---|---|
| `--state-success-bg` | `#E9F7EF` | success surfaces |
| `--state-success-text` | `#155724` | success text/icons |
| `--state-warning-bg` | `#FFF6E0` | warning surfaces |
| `--state-warning-text` | `#7A5400` | warning text/icons |
| `--state-danger-bg` | `#FDECEC` | error surfaces |
| `--state-danger-text` | `#8A1F1F` | error text/icons |
| `--state-info-bg` | `#EEF5FF` | info surfaces |
| `--state-info-text` | `#1F4C8A` | info text/icons |

## 4) Usage Boundary (Fail-Closed)

1. UI files must consume semantic/state tokens only.
2. Raw hex literals are forbidden in component/page styles.
3. Raw hex literals are allowed only in token-definition files and this contract doc.
4. Any new semantic token must map to existing base brand tokens or a documented state token.

## 5) Handoff Rules for MUS-1688

1. Replace inline brand literals with semantic tokens first (`surface/text/accent/border`).
2. Keep token names stable; do not rename without CTO comment approval on MUS-1707.
3. Provide before/after diff evidence showing removal of hardcoded brand hex in UI files.
4. QA gate must verify no hardcoded brand hex remains outside token definitions.

## 6) Acceptance Mapping

- Brand SSOT exact values included: `#2D1D19`, `#FFD166`, `#FDFCF0`.
- Semantic/state token dictionary and usage boundaries are explicit.
- This artifact is runtime-independent and admissible without Pencil runtime.
