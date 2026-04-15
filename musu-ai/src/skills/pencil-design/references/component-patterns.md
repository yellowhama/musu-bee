# Pencil.dev Component Patterns

## Design-to-Code Mappings

### Layout Properties

| Pencil | CSS | Tailwind |
| ------ | --- | -------- |
| `layout: "horizontal"` | `display: flex; flex-direction: row` | `flex flex-row` |
| `layout: "vertical"` | `display: flex; flex-direction: column` | `flex flex-col` |
| `layout: "grid"` | `display: grid` | `grid` |
| `gap: 8` | `gap: 8px` | `gap-2` |
| `gap: 16` | `gap: 16px` | `gap-4` |
| `gap: 24` | `gap: 24px` | `gap-6` |
| `padding: [16,16,16,16]` | `padding: 16px` | `p-4` |
| `padding: [8,16,8,16]` | `padding: 8px 16px` | `py-2 px-4` |

### Shape Properties

| Pencil | CSS | Tailwind |
| ------ | --- | -------- |
| `cornerRadius: [4,4,4,4]` | `border-radius: 4px` | `rounded` |
| `cornerRadius: [8,8,8,8]` | `border-radius: 8px` | `rounded-lg` |
| `cornerRadius: [16,16,16,16]` | `border-radius: 16px` | `rounded-2xl` |
| `cornerRadius: [9999,9999,9999,9999]` | `border-radius: 9999px` | `rounded-full` |
| `opacity: 0.5` | `opacity: 0.5` | `opacity-50` |

### Typography

| Pencil | CSS | Tailwind |
| ------ | --- | -------- |
| `fontSize: 12` | `font-size: 12px` | `text-xs` |
| `fontSize: 14` | `font-size: 14px` | `text-sm` |
| `fontSize: 16` | `font-size: 16px` | `text-base` |
| `fontSize: 18` | `font-size: 18px` | `text-lg` |
| `fontSize: 20` | `font-size: 20px` | `text-xl` |
| `fontSize: 24` | `font-size: 24px` | `text-2xl` |
| `fontWeight: 400` | `font-weight: 400` | `font-normal` |
| `fontWeight: 500` | `font-weight: 500` | `font-medium` |
| `fontWeight: 600` | `font-weight: 600` | `font-semibold` |
| `fontWeight: 700` | `font-weight: 700` | `font-bold` |

## Common UI Patterns (batch_design templates)

### Button

```
batch_design insert:
- Frame (horizontal layout, gap: 8, padding: [10, 16])
  - Icon (optional, 20x20)
  - Text ("Button Label", fontSize: 14, fontWeight: 600)
- cornerRadius: [8,8,8,8]
- fill: primary color
```

### Input Field

```
batch_design insert:
- Frame (vertical layout, gap: 4)
  - Text ("Label", fontSize: 14, fontWeight: 500, color: muted)
  - Frame (horizontal layout, padding: [10, 12])
    - Text ("Placeholder", fontSize: 14, color: placeholder)
  - cornerRadius: [6,6,6,6], border: 1px muted
```

### Card

```
batch_design insert:
- Frame (vertical layout, gap: 16, padding: [20, 20])
  - Text ("Title", fontSize: 18, fontWeight: 600)
  - Text ("Description", fontSize: 14, color: muted)
  - Frame (horizontal layout, gap: 8) -> action buttons
- cornerRadius: [12,12,12,12], fill: surface, shadow
```

### Modal / Dialog

```
batch_design insert:
- Frame (480x auto, vertical layout, padding: [24, 24], gap: 20)
  - Frame (horizontal, justify: space-between)
    - Text ("Dialog Title", fontSize: 18, fontWeight: 600)
    - Icon (X close, 20x20)
  - Frame (vertical, gap: 16) -> content area
  - Frame (horizontal, gap: 8, justify: end) -> action buttons
- cornerRadius: [16,16,16,16], fill: surface, shadow: lg
```

### List Item

```
batch_design insert:
- Frame (horizontal layout, padding: [12, 16], gap: 12, align: center)
  - Frame (40x40, cornerRadius: full) -> avatar/icon
  - Frame (vertical, gap: 2, flex: 1)
    - Text ("Primary text", fontSize: 14, fontWeight: 500)
    - Text ("Secondary text", fontSize: 12, color: muted)
  - Icon (chevron-right, 16x16, color: muted)
```

### Empty State

```
batch_design insert:
- Frame (vertical layout, padding: [48, 24], gap: 16, align: center)
  - Icon (illustration, 64x64, color: muted)
  - Text ("No items yet", fontSize: 18, fontWeight: 600)
  - Text ("Create your first item to get started.", fontSize: 14, color: muted)
  - Button frame (primary CTA)
```

## Frame Size Conventions

| Type | Size | Usage |
| ---- | ---- | ----- |
| Mobile | 375x812 | iPhone standard |
| Mobile Large | 390x844 | iPhone Pro |
| Tablet | 768x1024 | iPad |
| Desktop | 1440x900 | Standard desktop |
| Desktop Wide | 1920x1080 | Full HD |
| Component | auto x auto | Individual components |

## batch_get + Code Generation

When reading design structure for code generation:

```
batch_get parameters:
  filePath: "/path/to/design.pen"
  nodeIds: ["frame-id-1", "frame-id-2"]
  readDepth: 10
  resolveInstances: true
  resolveVariables: true
```

This returns the full component tree with resolved values, ready for mapping to React/HTML.

## Button States Reference

| State | Visual Treatment |
| ----- | ---------------- |
| Default | Base colors, clearly interactive |
| Hover | Darken 10%, subtle shadow (desktop only) |
| Active | Darken 20%, slight scale down |
| Focus | Visible outline ring (2px) |
| Disabled | 50% opacity, no pointer events |
| Loading | Spinner replaces or accompanies label |

## Modal Guidelines

- **Size**: 400-600px width desktop, full-width mobile
- **Overlay**: Semi-transparent dark (rgba(0,0,0,0.5))
- **Close**: X button, overlay click, Escape key
- **Focus**: Trap within modal
- **Primary action**: Right-aligned, visually prominent

## Loading Patterns

| Duration | Pattern |
| -------- | ------- |
| <1s | No indicator |
| 1-3s | Spinner or indicator |
| 3-10s | Skeleton + progress |
| >10s | Progress bar + explanation |
