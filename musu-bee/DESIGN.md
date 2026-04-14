# MUSU Design System

**Product:** MUSU — Hive-Orchestrated Agent Runtime
**UI:** musu-bee (Next.js)
**Archetype:** Architect · Guardian · Operator
**Tagline:** The Agent Runtime for Vibe Coders.

---

## 1. Visual Theme & Atmosphere

**Mood:** Cold precision with warm undertones. Like a server room lit by candlelight — dark, purposeful, nothing decorative. Every element earns its place.

**Density:** Medium-tight. Information-dense panels (chat, tasks, nodes) with generous breathing room between sections. Not sparse like Apple. Not crammed like a Bloomberg terminal.

**Philosophy:**
- Dark-native. No light mode is the default; the UI lives in darkness.
- Terminal-adjacent. Monospace where it matters (logs, IDs, code). Sans-serif everywhere else.
- Precision over personality. Rounded corners (8px), not pill-shaped. Clean, not bubbly.
- Warm darkness. Background is Cocoa Brown, not flat black. Feels grounded, not cold.
- The agent is the product. UI gets out of the way.

**Inspirations:** Linear (restraint), Cursor (code-density), Supabase (semantic clarity), Raycast (interaction polish)

---

## 2. Color Palette & Roles

### Foundation
| Token | Hex | Role |
|-------|-----|------|
| `--bg-base` | `#0d0d0d` | Page background (pure dark) |
| `--bg-surface` | `#111111` | Raised panels, sidebars |
| `--bg-card` | `#1a1a1a` | Cards, chat bubbles, list items |
| `--bg-overlay` | `#222222` | Modals, dropdowns, popovers |
| `--bg-hover` | `#2a2a2a` | Hover state for list rows |
| `--bg-brand` | `#2D1D19` | Cocoa Brown — headers, brand surfaces |

### Text
| Token | Hex | Role |
|-------|-----|------|
| `--text-primary` | `#F3F4F6` | Body, labels, all primary content |
| `--text-secondary` | `#9CA3AF` | Metadata, timestamps, descriptions |
| `--text-muted` | `#6B7280` | Placeholder, helper text |
| `--text-dim` | `#374151` | Disabled, dividers embedded in text |
| `--text-on-accent` | `#2D1D19` | Text on yellow buttons |

### Borders
| Token | Hex | Role |
|-------|-----|------|
| `--border-subtle` | `#1F1F1F` | Panel borders, card edges |
| `--border-default` | `#2D2D2D` | Default visible borders |
| `--border-strong` | `#404040` | Active/focus visible borders |

### Accent — Musu Yellow
| Token | Hex / Value | Role |
|-------|-------------|------|
| `--accent` | `#FFD166` | Primary CTA, active indicators, links |
| `--accent-hover` | `#FFC947` | Hover state for accent elements |
| `--accent-muted` | `rgba(255,209,102,0.12)` | Highlighted row bg, selection bg |
| `--accent-glow` | `rgba(255,209,102,0.20)` | Box-shadow on accent button hover |
| `--accent-border` | `rgba(255,209,102,0.30)` | Accent-colored borders (badges, outlines) |

### Semantic Status
| Token | Hex | Usage |
|-------|-----|-------|
| `--status-online` | `#22C55E` | Agent online, task done |
| `--status-online-bg` | `rgba(34,197,94,0.12)` | Online status bg |
| `--status-running` | `#60A5FA` | Task running, agent busy |
| `--status-running-bg` | `rgba(96,165,250,0.12)` | Running status bg |
| `--status-pending` | `#9CA3AF` | Task pending, agent idle |
| `--status-error` | `#F87171` | Task failed, connection error |
| `--status-error-bg` | `rgba(248,113,113,0.12)` | Error status bg |
| `--status-warn` | `#F59E0B` | Warning, degraded state |

### Shadows
```css
--shadow-sm:   0 1px 2px rgba(0,0,0,0.40);
--shadow-md:   0 4px 12px rgba(0,0,0,0.50);
--shadow-warm: 0 8px 24px rgba(45,29,25,0.20);   /* Cocoa-tinted */
--shadow-glow: 0 0 16px rgba(255,209,102,0.18);   /* Yellow glow */
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
background: #FFD166;
color: #2D1D19;
border: none;
border-radius: 6px;
padding: 8px 16px;
font-size: 13px;
font-weight: 600;
transition: all 0.15s ease;
/* Hover: */
background: #FFC947;
box-shadow: 0 0 14px rgba(255,209,102,0.22);
transform: translateY(-1px);
```

**Secondary (Outline)**
```css
background: transparent;
color: #FFD166;
border: 1px solid rgba(255,209,102,0.35);
border-radius: 6px;
padding: 6px 14px;
/* Hover: background rgba(255,209,102,0.08) */
```

**Destructive (Cancel, Delete)**
```css
background: transparent;
color: #F87171;
border: 1px solid #F87171;
border-radius: 4px;
padding: 2px 8px;
font-size: 11px;
```

**Ghost / Icon**
```css
background: transparent;
color: #6B7280;
border: none;
padding: 4px 8px;
border-radius: 4px;
/* Hover: background #1F1F1F, color #9CA3AF */
```

### Cards / List Items

**Standard card**
```css
background: #1A1A1A;
border: 1px solid #1F1F1F;
border-radius: 8px;
padding: 12px 14px;
/* Hover: border-color #2D2D2D */
```

**Active/selected card**
```css
border-color: rgba(255,209,102,0.30);
background: rgba(255,209,102,0.05);
```

**Do not:** Add box-shadow to cards. Borders carry the depth.

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
background: #0D0D0D;
border-right: 1px solid #1F1F1F;
width: 220px;
/* Channel items */
padding: 6px 12px;
border-radius: 6px;
font-size: 13px;
color: #6B7280;
/* Active channel: background rgba(255,209,102,0.10), color #FFD166 */
/* Unread badge: background #FFD166, color #2D1D19, border-radius 999px */
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
- ✓ Use semantic colors for all status states — never ad-hoc colors
- ✓ Use `#FFD166` as the single accent — not blue, not purple
- ✓ Mount unmount guards on polling hooks (`let mounted = true`)
- ✓ Show "loading…" in gray (`#6B7280`), errors in red (`#F87171`)
- ✓ Keep header heights consistent: 52–60px per panel
- ✓ Truncate long text with `-webkit-line-clamp` or `text-overflow: ellipsis`
- ✓ Add `cursor: pointer` to every interactive element

### Don't
- ✗ Gradients in UI panels (landing page only)
- ✗ Bright white (`#FFFFFF`) anywhere — use `#F3F4F6` max
- ✗ Blue links — use `#FFD166` for interactive text
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
