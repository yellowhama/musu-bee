# Accessibility Guidelines for Pencil.dev Designs

## WCAG 2.1 Quick Compliance Checklist (AA Level)

- [ ] Color contrast 4.5:1 for normal text
- [ ] Color contrast 3:1 for large text (18px+ or 14px bold)
- [ ] Touch targets minimum 44x44px
- [ ] All functionality available via keyboard
- [ ] Visible focus indicators
- [ ] No content flashes more than 3 times/second
- [ ] Page has descriptive title
- [ ] Link purpose clear from text
- [ ] Form inputs have labels
- [ ] Error messages are descriptive

## Color and Contrast

### Contrast Ratios

| Element | Minimum Ratio | Enhanced (AAA) |
| ------- | ------------- | -------------- |
| Body text | 4.5:1 | 7:1 |
| Large text (18px+) | 3:1 | 4.5:1 |
| UI components | 3:1 | - |
| Graphical objects | 3:1 | - |

### Color Independence

Never use color as the only means of conveying information:

```
Bad:  Error fields shown only in red
Good: Error fields with red border + error icon + text message

Bad:  Required fields marked only with red asterisk
Good: Required fields labeled "(required)" or with icon + tooltip

Bad:  Status shown only by color dots
Good: Status with color + icon + label text
```

### Safe Text Colors on Backgrounds

| Background | Text Color | Contrast |
| ---------- | ---------- | -------- |
| White (#FFFFFF) | Dark gray (#1F2937) | 15.5:1 |
| Light gray (#F3F4F6) | Dark gray (#374151) | 10.9:1 |
| Primary blue (#2563EB) | White (#FFFFFF) | 4.6:1 |
| Dark (#111827) | White (#FFFFFF) | 18.1:1 |

## Keyboard Navigation

### Requirements

1. All interactive elements reachable via Tab
2. Logical tab order following visual layout
3. No keyboard traps
4. Focus always visible during keyboard navigation
5. Skip links for repetitive navigation

### Focus Indicators

```css
:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}
```

### Expected Key Behaviors

| Key | Behavior |
| --- | -------- |
| Tab | Next interactive element |
| Shift+Tab | Previous element |
| Enter | Activate button/link |
| Space | Activate button, toggle checkbox |
| Escape | Close modal/dropdown |
| Arrow keys | Navigate within components |

## Touch Targets

| Platform | Minimum | Recommended |
| -------- | ------- | ----------- |
| WCAG 2.1 | 44x44px | 48x48px |
| iOS | 44x44pt | - |
| Android | 48x48dp | - |

Minimum 8px spacing between adjacent targets.

## Semantic HTML Mapping

When generating code from Pencil designs:

| Design Element | HTML | Not This |
| -------------- | ---- | -------- |
| Navigation frame | `<nav>` | `<div class="nav">` |
| Content area | `<main>` | `<div id="main">` |
| Header frame | `<header>` | `<div class="header">` |
| Button | `<button>` | `<div onclick>` |
| Link | `<a href>` | `<span onclick>` |

### Heading Hierarchy

```
h1 - Page Title (one per page)
  h2 - Major Section
    h3 - Subsection
      h4 - Sub-subsection
```

Never skip levels.

## Forms Accessibility

- Every input must have an associated label
- Mark optional fields (not required — fewer asterisks)
- Show requirements before errors
- Group related fields with fieldset/legend
- Preserve data on errors

## Validating in Pencil

Use `get_screenshot` to capture frames and verify:
- Contrast between text and backgrounds
- Touch target sizing
- Spacing between interactive elements
- Visual hierarchy and reading order

## ARIA Quick Reference

**First rule**: Don't use ARIA if native HTML works.

| Property | Purpose |
| -------- | ------- |
| `aria-label` | Accessible name |
| `aria-labelledby` | Reference to labeling element |
| `aria-describedby` | Reference to description |
| `aria-hidden` | Hide from assistive tech |
| `aria-expanded` | Expandable state |
| `aria-required` | Required field |
| `aria-invalid` | Invalid input |
