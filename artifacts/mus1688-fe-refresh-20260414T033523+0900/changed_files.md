# MUS-1688 Changed Files (scope declaration)

1. `musu-bee/src/app/globals.css`
- Adds canonical MUSU brand CSS variables (`--musu-color-brand-*`) and RGB companions.
- Wires existing shell background/text to variables for tokenized consumption.

2. `musu-bee/src/app/landing-exp/page.tsx`
- Adds `/landing-exp` user-facing page without inline style blocks.
- Preserves waitlist form contract (`POST /api/waitlist?from=/landing-exp`) and explicit status branches (`ok|invalid_email|error`).

3. `musu-bee/src/app/landing-exp/page.module.css`
- Applies brand token variables to landing-exp visual surface.
- Uses `var(--musu-color-brand-*)` and `rgb(var(--musu-color-brand-*-rgb) / alpha)` pattern instead of raw brand hex literals.

4. `musu-bee/src/app/brand-tokens.test.ts`
- Guards canonical token definitions in `globals.css`.
- Fails if raw brand hex literals leak outside `globals.css` or deprecated alias vars are consumed directly.

5. `musu-bee/src/app/landing-exp/page.module.test.ts`
- Asserts landing-exp CSS module consumes token vars and does not hardcode brand hex/rgb literals.

6. `musu-bee/src/app/landing-exp/page.contract.test.ts`
- Enforces waitlist form action contract and supported status branch rendering paths.
