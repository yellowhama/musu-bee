# Platform Guidelines for Pencil.dev Designs

## Screen Sizes

### Mobile

| Device | Width | Height |
| ------ | ----- | ------ |
| iPhone SE | 375 | 667 |
| iPhone 14/15 | 390 | 844 |
| iPhone 14 Pro Max | 430 | 932 |
| Android Small | 360 | 640 |
| Android Large | 412 | 915 |

### Tablet

| Device | Width | Height |
| ------ | ----- | ------ |
| iPad Mini | 744 | 1133 |
| iPad | 768 | 1024 |
| iPad Pro 11" | 834 | 1194 |

### Desktop (Tailwind Breakpoints)

| Breakpoint | Width | Usage |
| ---------- | ----- | ----- |
| sm | 640px | Mobile landscape |
| md | 768px | Tablet portrait |
| lg | 1024px | Small desktop |
| xl | 1280px | Standard desktop |
| 2xl | 1536px | Large desktop |

## Layout Patterns

### Mobile App (375x812)

```
+-----------------------+
| Status Bar     44px   |
+-----------------------+
| Nav Bar        56px   |
+-----------------------+
|                       |
| Content Area          |
| padding: 16px         |
|                       |
+-----------------------+
| Tab Bar        84px   |
+-----------------------+
```

### Desktop App — Sidebar

```
+--------+----------------------------+
|        | Header           48-64px   |
| Side   +----------------------------+
| bar    |                            |
| 48-    | Content Area               |
| 280px  | padding: 24-32px           |
|        |                            |
+--------+----------------------------+
```

### Desktop App — Tauri / Electron

```
+----------------------------------+
| Title Bar (draggable)     32px   |
+------+---------------------------+
| Rail | Content                   |
| 48px |                           |
|      |                           |
+------+---------------------------+
| Status Bar (optional)     24px   |
+----------------------------------+
```

## Spacing System (8px Grid)

| Token | Value | Tailwind | Usage |
| ----- | ----- | -------- | ----- |
| 0.5 | 2px | `gap-0.5` | Minimal |
| 1 | 4px | `gap-1` | Tight inline |
| 2 | 8px | `gap-2` | Related items |
| 3 | 12px | `gap-3` | List items |
| 4 | 16px | `gap-4` | Default padding |
| 6 | 24px | `gap-6` | Section gap |
| 8 | 32px | `gap-8` | Major sections |
| 12 | 48px | `gap-12` | Page sections |

## Typography Scale

| Level | Size | Line Height | Weight | Tailwind |
| ----- | ---- | ----------- | ------ | -------- |
| Display | 48px | 1.1 | Bold | `text-5xl font-bold` |
| H1 | 36px | 1.2 | Bold | `text-4xl font-bold` |
| H2 | 28px | 1.3 | Semibold | `text-2xl font-semibold` |
| H3 | 22px | 1.4 | Semibold | `text-xl font-semibold` |
| Body | 16px | 1.5 | Regular | `text-base` |
| Small | 14px | 1.5 | Regular | `text-sm` |
| Caption | 12px | 1.4 | Regular | `text-xs` |

## Color Patterns

### Semantic Colors (Dark Theme — MUSU Desktop)

| Purpose | Color |
| ------- | ----- |
| Background | #0A0A0A |
| Surface | #171717 |
| Border | #262626 |
| Text Primary | #FAFAFA |
| Text Secondary | #A3A3A3 |
| Primary | Brand color |
| Destructive | #F87171 |
| Success | #4ADE80 |
| Warning | #FBBF24 |

### Semantic Colors (Light Theme)

| Purpose | Color |
| ------- | ----- |
| Background | #FFFFFF |
| Surface | #F5F5F5 |
| Border | #E5E5E5 |
| Text Primary | #0A0A0A |
| Text Secondary | #737373 |
| Primary | Brand color |
| Destructive | #EF4444 |
| Success | #22C55E |
| Warning | #F59E0B |

## iOS Quick Reference

- Tab Bar: max 5 tabs, 49pt height
- Nav Bar: 44pt minimum
- Typography: SF Pro (17pt body)
- Touch: 44x44pt minimum

## Android Quick Reference

- Bottom Nav: 3-5 items, 80dp height
- App Bar: 64dp height
- Typography: Roboto (16sp body)
- Touch: 48x48dp minimum
- FAB: 56dp standard

## Responsive Patterns

| Pattern | Description |
| ------- | ----------- |
| Stack | Columns become rows on mobile |
| Reflow | Content reorders by priority |
| Reveal | More content at larger sizes |
| Off-canvas | Nav slides in on mobile |
| Scale | Elements scale proportionally |
