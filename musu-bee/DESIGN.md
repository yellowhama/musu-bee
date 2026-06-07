# MUSU Design System

This document is the source of truth for `musu-bee` and the Pencil design file
`musu.pen`. It describes the current product surface, not a future redesign.

## 1. Brand Direction

MUSU uses a light neo-brutalist control-room style:

- Crisp black structure, heavy borders, and hard shadows.
- White or warm-paper canvases for long-running operational work.
- Orange accents for active commands, approvals, and selected state.
- Minimal radius and no soft glow/orb decoration.

The app should feel like an operator cockpit for "running your own AI company
across your own devices": dense enough for repeated work, but visually direct.

## 2. Core Tokens

These tokens mirror `src/app/globals.css`.

| Purpose | Token | Value |
|---|---|---|
| Brand ink | `--musu-color-brand-ink` | `#000000` |
| Brand accent | `--musu-color-brand-accent` | `#FF9800` |
| Brand canvas | `--musu-color-brand-canvas` | `#FFFFFF` |
| Base background | `--bg-base` | `#FFFFFF` |
| Surface | `--bg-surface` | `#FFFFFF` |
| Primary text | `--fg1` | `#000000` |
| Secondary text | `--fg2` | `#374151` |
| Muted text | `--fg3` | `#9CA3AF` |
| Default border | `--border-default` | `#000000` |
| Accent | `--accent` | `#FF9800` |
| Online | `--status-online` | `#22C55E` |
| Running | `--status-running` | `#3B82F6` |
| Error | `--status-error` | `#EF4444` |

Light mode may warm the canvas to paper tones (`#FDFBF7`, `#F5F0E8`) while
preserving the same black/orange structural language.

## 3. Layout Contract

MUSU surfaces should prefer operational layouts over marketing layouts:

- Left rail: navigation, channels, fleet/node context, and machine-level state.
- Center workspace: Dev / Town / Butler work surfaces, dashboards, widgets, and
  remote-control views.
- Right console: agent chat, execution plans, approvals, logs, and node selector.

Panels are separated by strong borders. Repeated items may use cards, but page
sections should stay unframed and full-width within the app shell.

AG UI/UX for remote input, local execution, project rooms, device mesh, and
evidence is specified in
`docs/AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`. That document extends this
layout contract without changing the product boundary: MUSU.PRO coordinates,
while local MUSU Desktop runtimes execute work.

## 4. Components

- Buttons and controls use black borders, hard shadows, and immediate pressed
  states.
- Cards and panels use `0px` radius unless an existing component contract needs
  otherwise.
- Approval or destructive decisions must be visually explicit; orange is reserved
  for important action/selection state, not background decoration.
- Status should be expressed with compact labels, color, and icons where useful.

## 5. Typography And Effects

- UI font: `Inter` / `Pretendard`-style sans serif.
- Mono font: `IBM Plex Mono` or a system monospace for logs and code.
- Shadows are hard offset shadows only, e.g. `4px 4px 0 #000000`.
- Avoid blur shadows, gradients as primary structure, bokeh/orb decoration, and
  hero-scale typography inside dense tool panels.

## 6. Agent Grid UX

Agent Grid surfaces should make execution location explicit on every run:

- input source: MUSU.PRO, desktop, CLI, or room
- execution device: named local MUSU Desktop runtime
- route kind: LAN, Tailscale, Direct QUIC, or Relay
- evidence state: available, missing, stale, or failed

The primary app should lead with Command Center, Project Rooms, Agent Grid,
Device Mesh, Tasks, Evidence, and Settings rather than a generic chatbot.
