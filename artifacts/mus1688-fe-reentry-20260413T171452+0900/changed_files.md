# MUS-1688 Changed Files (Purpose)
- `musu-bee/src/app/globals.css`: Defines canonical MUSU brand tokens (`ink/accent/canvas/stroke`) and RGB companions; keeps backward-compatible aliases.
- `musu-bee/src/app/landing-exp/page.tsx`: Replaces inline-style approach with CSS-module classes and enforces explicit waitlist status handling (`ok|invalid_email|error`) on `/landing-exp`.
- `musu-bee/src/app/landing-exp/page.module.css`: Uses CSS vars/RGB vars for brand palette consumption, replacing raw brand literals in this surface.
- `musu-bee/src/app/landing-exp/page.module.test.ts`: Regression guard that forbids hardcoded brand palette literals in landing-exp CSS module and asserts CSS var usage.
- `musu-bee/src/app/landing-exp/page.contract.test.ts`: Contract guard for waitlist form action and explicit status-branch rendering.
- `musu-bee/src/app/brand-tokens.test.ts`: Repo-level guard ensuring canonical tokens live in `globals.css`, forbidding raw brand hex outside globals, and preventing deprecated alias consumption.
