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

Post-push deploy verification:

- Commit `b08ed746` (`Harden public site deploy and scroll`) was pushed to
  `main`.
- GitHub Actions passed: `Tests` run `26759256487`, `E2E Tests - musu-bee` run
  `26759256574`, and `Deploy musu-bee to Vercel` run `26759256616`.
- Vercel deploy job completed successfully for head SHA
  `b08ed74609db3b340590fd2122a4fef10d43f853`.
- Live Playwright QA against `https://musu.pro` with `qa=b08ed746` passed on
  `/`, `/landing`, `/pricing`, and `/install` for desktop `1280x720` and
  mobile `390x844`.
- Verified signals: actual scroll position changed after `window.scrollTo`, no
  horizontal overflow, `.musu-public-scroll-root=true`, logo source contains
  `favicon-header`, `data-brand-accent=emerald`, and
  `--musu-color-brand-emerald=#24C8DB`.

Final go/no-go check:

- `write-release-go-no-go.ps1 -Json` on commit `bce29066` reports
  `ready_for_public_desktop_release=false`, `manifest_dirty=false`,
  `public_metadata_ok=true`, `msix_install_verified=true`, and
  `msix_desktop_entrypoint_verified=true`.
- `single_machine_verified=false`, runtime idle CPU `0/2`, and runtime CPU
  scenario matrix `0/2` because the public-site CSS/workflow source commit made
  the previous primary smoke/CPU/matrix evidence no longer source-current.
- This does not affect the live public-site deployment result, but it does mean
  the next release-gate step is another primary smoke, desktop-open CPU, and
  4-state CPU matrix refresh before second-PC evidence can be treated as the
  final runtime blocker.
