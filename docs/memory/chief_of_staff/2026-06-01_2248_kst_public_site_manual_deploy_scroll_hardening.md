# 2026-06-01 22:48 KST - Public site manual deploy and scroll hardening

Operator asked whether the public-site scroll/logo/accent work should be
deployed to `musu.pro`.

Findings:

- Live `https://musu.pro` was already serving the favicon-header logo and
  `#24C8DB` emerald accent, and Playwright confirmed actual scroll movement on
  desktop `1280x720` and mobile `390x844`.
- Vercel CLI on this machine is logged in as `yellowhama`, but the default
  Vercel scope does not expose the `musu.pro` domain/project. GitHub Actions
  remains the canonical deployment path because repo secrets contain
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN`.
- The deploy workflow only ran on `push` path filters, so manual production
  redeploys were not available from GitHub UI/CLI.

Changes:

- `.github/workflows/deploy-musu-bee.yml` now supports `workflow_dispatch` so
  `Deploy musu-bee to Vercel` can be manually redeployed for `main`.
- `musu-bee/src/app/globals.css` hardens `.musu-public-scroll-root` with
  explicit `height:auto`, `max-height:none`, `touch-action:pan-y`,
  `-webkit-overflow-scrolling:touch`, and `html/body:has(...)` viewport-scroll
  rules.

Validation before push:

- `npm run typecheck` passed.
- `npx playwright test --config=playwright.public-site.config.ts` passed 8/8.
- `npm run build` passed.
- `git diff --check` passed.

Release implication:

- This is a production site/deploy hardening change, not a public desktop
  release gate closure.
- Public desktop release remains No-Go until second-PC runtime evidence,
  release-grade route proof, production P2P control-plane auth, `musu@musu.pro`
  inbox evidence, Store evidence, and relay/tunnel transport are complete.
