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

Live deploy verification:

- Commit `674f501` (`Harden public site scroll and logo`) passed GitHub `Tests` run `26743680160`, `E2E Tests — musu-bee` run `26743680172`, and Vercel deploy run `26743680165`.
- Live Playwright QA against `https://musu.pro` with `qa=674f501` passed for `/`, `/landing`, `/pricing`, and `/install` on desktop `1280x720` and mobile `390x844`.
- Verified signals: `canScroll=true`, no horizontal overflow, `bodyOverflowY=auto`, `htmlOverflowY=auto`, `.musu-public-scroll-root=true`, logo source contains `favicon-header.png`, and `--musu-color-brand-emerald=#24C8DB`.
