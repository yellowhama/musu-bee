# 2026-06-01 17:22 KST - Public site scroll/logo follow-up

The operator reported that the public site did not scroll and asked to use the desktop app favicon mark as the visible site logo, with the mark's teal/emerald color used as an accent.

Actions taken:

- `musu-bee/src/app/page.tsx` now uses the shared `MusuLogo` component in the header/footer and marks the public root with `musu-public-scroll-root`.
- `musu-bee/src/components/PublicSiteShell.tsx` now uses the same `MusuLogo` favicon mark instead of an ad hoc image/text header.
- `musu-bee/src/components/brand/MusuLogo.tsx` header size was tuned so the favicon mark reads correctly in nav contexts.
- `musu-bee/src/app/globals.css` now includes the missing brand RGB tokens and the public scroll root class.
- `musu-bee/e2e/public-site-scroll-brand.spec.ts` and `musu-bee/playwright.public-site.config.ts` now verify homepage scroll, favicon-mark rendering, no horizontal overflow, and `#24C8DB` emerald accent on desktop and mobile.

Validation:

- `npm run typecheck` passed.
- `npx playwright test --config=playwright.public-site.config.ts` passed 2/2.
- `npm run build` passed.

Release note:

- Push to `main` should trigger the existing GitHub/Vercel production deploy to `musu.pro`.
- Live `https://musu.pro` must be rechecked after that deployment; do not treat the follow-up as live until the deployed commit is confirmed.
