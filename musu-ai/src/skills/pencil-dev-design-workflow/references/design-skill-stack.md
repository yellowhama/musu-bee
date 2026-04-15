# Design Skill Stack

Use this map to decide which existing design skills to apply.

## Default order

1. `ui-ux-expert`
2. `vercel-composition-patterns`
3. `vercel-react-best-practices`
4. `web-design-guidelines`

## Conditional additions

- Use `next-best-practices` when the target codebase is Next.js.
- Use `next-cache-components` when the task explicitly needs Next.js 16 cache components or PPR patterns.

## Responsibilities by skill

- `ui-ux-expert`
  - Set interaction model, hierarchy, accessibility intent.
  - Define mobile and desktop behavior.
- `vercel-composition-patterns`
  - Reshape component APIs to reduce boolean prop sprawl.
  - Build compound/render-prop/context patterns when component scale is growing.
- `vercel-react-best-practices`
  - Apply render and state placement optimizations.
  - Reduce avoidable client-side work and bundle cost.
- `web-design-guidelines`
  - Audit against web UI and accessibility rules.
  - Report concrete failures and required fixes.

## Minimum acceptance checks

1. Keyboard-only navigation works on primary flows.
2. Color contrast and focus indicators are visible.
3. Layout is stable across mobile and desktop breakpoints.
4. React/Next structure avoids unnecessary client boundaries.
