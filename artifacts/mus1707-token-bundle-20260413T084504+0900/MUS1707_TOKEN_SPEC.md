# MUS-1707 Token Spec (B1 Artifact)

## Scope
Design-token contract for MUSU CSS-vars migration lane (MUS-1688).
Brand SSOT locked: Cocoa `#2D1D19`, Musu Yellow `#FFD166`, Off-White `#FDFCF0`.

## Brand Primitives
| CSS Variable | .pen Token | Hex | Usage |
|---|---|---|---|
| `--musu-cocoa` | `$accent-text` | `#2D1D19` | Primary ink / text / borders |
| `--musu-yellow` | `$accent` | `#FFD166` | Primary accent / CTA fill |
| `--musu-offwhite` | `$bg-primary` | `#FDFCF0` | Default page background |

## Semantic Tokens
| CSS Variable | .pen Token | Usage |
|---|---|---|
| `--surface-base` | `$bg-primary` | App/page root surfaces |
| `--surface-panel` | `$bg-secondary` | Cards, panels, secondary sections |
| `--surface-elevated` | `$bg-elevated` | Modals/popovers/high elevation |
| `--text-primary` | `$text-primary` | Body and heading text |
| `--text-secondary` | `$text-secondary` | Secondary copy / labels |
| `--text-muted` | `$text-muted` | Meta text / helper text |
| `--border-default` | `$border` | Primary strokes and outlines |
| `--border-muted` | `$border-muted` | Subtle separators |
| `--accent-primary` | `$accent` | Primary CTA and emphasis actions |
| `--accent-hover` | `$accent-dim` | CTA hover/pressed states |
| `--focus-ring` | `$accent-glow` | Interactive focus halo |

## State Tokens
| CSS Variable | .pen Token | Usage |
|---|---|---|
| `--status-success` | `$status-ok` | Success badges / pass states |
| `--status-warning` | `$status-warn` | Warning states |
| `--status-error` | `$status-error` | Error states |
| `--status-info` | `$status-checking` | Info / checking states |

## Surface Usage Table
| Surface | Token Composition | Guidance |
|---|---|---|
| Landing hero CTA | `$accent + $accent-text` | High-priority conversion action |
| Dashboard cards | `$bg-secondary + $border-muted` | Readable dense operational surfaces |
| Settings forms | `$bg-elevated + $text-primary + $border` | Input fidelity with clear affordances |
| Toast/status indicators | `$status-ok/$status-warn/$status-error` | State communication independent of brand accent |

## Hard Rule
- Component examples must use token references only (no raw hex in children tree).
- Raw hex values are permitted only inside the token-definition section (`variables`).
