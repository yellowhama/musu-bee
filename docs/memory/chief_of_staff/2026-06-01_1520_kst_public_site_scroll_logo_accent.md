# 2026-06-01 15:20 KST - Public Site Scroll, Logo, and Accent Fix

Operator reported that the public site would not scroll and asked for the
site logo to match the current app/favicon mark.

Fix:

- `musu-bee/src/app/globals.css` changed global layout from
  `html, body { height:100%; overflow:hidden; }` to a scrollable body with
  `overflow-y:auto`.
- `musu-bee/src/app/layout.tsx` declares `/images/favicon-header.png` as the
  browser icon.
- `musu-bee/src/app/page.tsx` and `PublicSiteShell.tsx` use the same favicon
  mark as the visible site logo.
- The favicon-sampled teal `#24C8DB` is exposed as
  `--musu-color-brand-emerald` and used as a restrained public-site accent.

Validation:

- `npm run typecheck` passed.
- `npm run build` passed.
- Production-mode Playwright checks against `next start -p 3001` confirmed
  `/`, `/landing`, `/pricing`, and `/install` scroll on desktop and mobile,
  render the favicon logo, and load `#24C8DB`.

Deployment note:

- `musu.pro` is deployed by the existing GitHub Actions workflow
  `.github/workflows/deploy-musu-bee.yml` when `main` receives changes under
  `musu-bee/**`.
