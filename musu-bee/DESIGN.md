# MUSU Design System

**Product:** MUSU — Hive-Orchestrated Agent Runtime
**UI:** musu-bee (Next.js)
**Archetype:** Architect · Guardian · Operator
**Tagline:** The Agent Runtime for Vibe Coders.

---

## 1. Visual Theme & Atmosphere

**Mood:** Bold, stark, and architectural. A direct translation of Neo-Brutalism (Color Block Stack) principles into a functional AI orchestration plane. Raw structural elements with extremely high contrast.

**Density:** Medium-tight. Information-dense panels (chat, tasks, nodes) distinctly separated by thick structural borders. Content is aggressively compartmentalized.

**Philosophy:**
- High-contrast clarity. Pure black `#000000` boundaries and shadows on pure white `#FFFFFF` canvases.
- Structural borders. `3px solid black` for major components, no subtle gray lines.
- Sharp edges. `0px` border-radius everywhere (except circular status dots).
- Block shadows. `4px` or `8px` solid black drop shadows with no blur (`0px` blur radius) to create physical depth without lighting effects.
- The agent is the product. UI gets out of the way, but provides undeniable structure.

**Inspirations:** Gumroad (neo-brutalism layout), Figma (canvas structure), Figma Dev Mode (sharp tooling).

---

## 2. Color Palette & Roles

### Foundation
| Token | Hex | Role |
|-------|-----|------|
| `--bg-base` | `#FFFFFF` | Page background (pure white canvas) |
| `--bg-surface` | `#FFFFFF` | Raised panels, sidebars |
| `--bg-card` | `#FFFFFF` | Cards, chat bubbles, list items |
| `--surface-inverse`| `#000000` | Dark panels (e.g. Sidebar) |

### Text
| Token | Hex | Role |
|-------|-----|------|
| `--text-primary` | `#000000` | Body, labels, all primary content |
| `--text-secondary` | `#374151` | Secondary information |
| `--text-inverse` | `#FFFFFF` | Text on dark backgrounds |

### Borders
| Token | Hex | Role |
|-------|-----|------|
| `--border-default` | `#000000` | Core structural borders (3px thick) |

### Accent
| Token | Hex / Value | Role |
|-------|-------------|------|
| `--accent-primary` | `#FF9800` | Primary CTA, active indicators, highlights |

### Shadows (Neo-Brutalism)
```css
--neo-shadow-sm:  4px 4px 0px #000000;
--neo-shadow:     8px 8px 0px #000000;
```

---

## 3. Typography Rules

### Typefaces
| Role | Family | Fallback |
|------|--------|----------|
| **UI / Body** | Inter | -apple-system, system-ui, sans-serif |
| **Monospace** | JetBrains Mono | ui-monospace, SFMono-Regular, monospace |
| **Display (future)** | Sohne or Styrene A | Inter |

Never use: Comic Sans, Papyrus, decorative display fonts in UI panels.

### Scale
| Token | Size | Weight | Line-height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 10px | 400 | 1.4 | Task IDs, timestamps, monospace labels |
| `--text-sm` | 11px | 400–600 | 1.5 | Secondary metadata, badges |
| `--text-base` | 12px | 400 | 1.6 | Primary UI text, list items |
| `--text-md` | 13px | 400 | 1.6 | Chat messages, descriptions |
| `--text-lg` | 15px | 600 | 1.4 | Panel titles, section headers |
| `--text-xl` | 18px | 600–700 | 1.3 | Page headings |
| `--text-2xl` | 24px | 700 | 1.2 | Hero / landing headings |

### Rules
- Monospace is for: task_ids, agent IDs, log output, code, timestamps in panels
- **Bold (700)** only for: headings, primary CTA button text, critical alerts
- `letter-spacing: 0.05em` on: status badges, uppercase labels (8–12px only)
- `text-transform: uppercase` only for: status labels, category tags — never body copy
- Avoid mixing more than 2 font sizes in a single card

---

## 4. Component Stylings

### Buttons

**Primary (Execute action)**
```css
background: var(--accent-primary);
color: #000000;
border: 3px solid #000000;
border-radius: 0px;
box-shadow: 4px 4px 0px #000000;
padding: 10px 16px;
font-size: 14px;
font-weight: 800;
transition: transform 0.1s ease;
/* Active/Press: */
transform: translate(4px, 4px);
box-shadow: none;
```

**Destructive (Cancel, Delete)**
```css
background: #F87171;
color: #000000;
border: 3px solid #000000;
border-radius: 0px;
box-shadow: 4px 4px 0px #000000;
```

### Cards / List Items

**Neo-Brutalism card**
```css
background: #FFFFFF;
border: 3px solid #000000;
border-radius: 0px;
padding: 12px 16px;
box-shadow: 4px 4px 0px #000000;
```

**Active/selected card**
```css
border-color: #000000;
background: var(--accent-primary);
```

**Do:** Add solid block box-shadow to cards for that physical stacked look.

### Status Badges
```css
/* Base */
border-radius: 999px;
padding: 2px 8px;
font-size: 11px;
font-weight: 600;
letter-spacing: 0.05em;
text-transform: uppercase;
/* Background + text from semantic color table above */
```

### Inputs / Search
```css
background: #1A1A1A;
border: 1px solid #2D2D2D;
border-radius: 6px;
color: #F3F4F6;
padding: 8px 12px;
font-size: 13px;
/* Focus: border-color rgba(255,209,102,0.50), outline: none */
/* Placeholder: color #4B5563 */
```

### Sidebar / Navigation
```css
background: #000000;
border-right: 3px solid #000000;
width: 240px;
/* Channel items */
padding: 0px 12px;
border-radius: 4px;
font-size: 14px;
color: #FFFFFF;
/* Active channel: background #FF9800, color #000000, border: 3px solid #000000 */
```

### Dividers
```css
border-top: 1px solid #1F1F1F;  /* use sparingly */
```

### Scroll areas
- Thin scrollbar (4px), track transparent, thumb `#2D2D2D`, thumb-hover `#404040`
- Never show horizontal scrollbar in panels

---

## 5. Layout Principles

### Spacing Scale
```
4px  — xs  (icon padding, tight badge gap)
8px  — sm  (between inline elements)
12px — md  (card padding, list item gaps)
16px — lg  (section padding, panel padding)
24px — xl  (between sections)
32px — 2xl (page-level separation)
```

**Rule:** Use the scale. Never use arbitrary values like 13px, 17px, 22px.

### Grid
- **App shell:** Sidebar (220px) + Main (flex:1) + optional Right panel (320px)
- **Card grids:** `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, gap 12px
- **Panel header:** `display: flex; align-items: center; gap: 12px; padding: 20px 24px 12px`
- **Content area:** `flex: 1; overflow-y: auto; padding: 12px 16px`

### Whitespace Philosophy
- Headers get 20px top padding, 12px bottom (before the border)
- Content starts 12px below the header border
- Related items: 8px gap. Distinct sections: 24px gap.
- Do not fill every inch. Empty space is not wasted space.

---

## 6. Depth & Elevation

Three surfaces, no more:

| Layer | Background | Usage |
|-------|------------|-------|
| Base | `#0D0D0D` | Page, sidebar bg |
| Surface | `#111111` | Panel bg, main area |
| Card | `#1A1A1A` | List items, chat bubbles, task cards |
| Overlay | `#222222` | Dropdown menus, modals |

**Depth via borders, not shadows.** Shadows only on:
- Floating modals/popovers: `--shadow-md`
- Accent buttons on hover: `--shadow-glow`
- Never add box-shadow to cards, list items, or sidebar

**Glass effect (use sparingly — modals only)**
```css
background: rgba(17,17,17,0.85);
backdrop-filter: blur(12px);
border: 1px solid #2D2D2D;
```

---

## 7. Do's and Don'ts

### Do
- ✓ Use monospace for task IDs, agent IDs, execution logs, timestamps in panels
- ✓ Use pure `#000000` for borders, shadows, and text on light surfaces
- ✓ Use `#FF9800` as the bold accent color
- ✓ Make sure elements look physically stacked via `4px 4px 0px #000` box-shadows
- ✓ Sharp corners (`0px` border radius) for primary UI regions

### Don't
- ✗ Soft blurred shadows (e.g. `box-shadow: 0 4px 12px rgba(0,0,0,0.1)`)
- ✗ Subtle gray borders (always use `3px solid black`)
- ✗ Rounded containers (`border-radius: 8px` is forbidden in Neo-Brutalism except for maybe badges)
- ✗ Multiple accent colors in a single view
- ✗ Emojis in UI (landing page only, with purpose)
- ✗ `box-shadow` on cards (use border instead)
- ✗ `border-radius > 8px` on containers (999px for badges only)
- ✗ Font sizes below 10px
- ✗ `font-weight: 400` for button labels — use 600 minimum
- ✗ Padding that breaks the 4px grid

---

## 8. Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| `< 640px` | Sidebar collapses to bottom nav (4 icons) |
| `640–1024px` | Sidebar icon-only (48px), main full width |
| `> 1024px` | Full 3-pane: sidebar + main + optional right panel |

**Touch targets:** Minimum 44×44px for interactive elements on mobile.

**Chat panel on mobile:** Full width, no sidebar visible. Back button to return to channel list.

---

## 9. Agent Prompt Guide

### Quick Reference
```
Background:  #0D0D0D (base) / #111111 (surface) / #1A1A1A (card)
Accent:      #FFD166 (yellow) — only accent
Text:        #F3F4F6 (primary) / #9CA3AF (secondary) / #6B7280 (muted)
Border:      #1F1F1F (subtle) / #2D2D2D (default)
Status:      green #22C55E / blue #60A5FA / gray #9CA3AF / red #F87171
Font:        Inter (UI) + JetBrains Mono (code/IDs)
Radius:      6–8px (containers), 4px (small), 999px (badges only)
Brand bg:    #2D1D19 (Cocoa Brown — headers, brand surfaces only)
```

### Ready-to-Use Prompts

**Chat panel:**
> "Build a chat message panel using DESIGN.md. Dark bg (#111111), monospace text for system messages, yellow accent for the send button, mounted guard on the WebSocket hook."

**Task card:**
> "Build a task status card using DESIGN.md. Status badge (uppercase, pill, semantic colors), monospace task_id at bottom (10px, #374151), cancel button only for pending/running states."

**Agent list:**
> "Build an agent list using DESIGN.md. Each row: status dot (semantic color, 8px pulse animation when running), agent name (13px Inter), channel badge (pill #1A1A1A), online time (right-aligned muted text)."

**Sidebar channel list:**
> "Build a sidebar using DESIGN.md. Channel items with 6px radius hover, active state yellow tint, unread badge (yellow bg, brown text), icons are optional (text labels work)."

---

*DESIGN.md — MUSU v1.0 | 2026-04-15 | Based on: Linear (restraint) + Cursor (density) + Raycast (interaction) + Supabase (semantics)*
