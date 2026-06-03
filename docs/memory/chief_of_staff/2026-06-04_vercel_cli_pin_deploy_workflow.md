# 2026-06-04 Vercel CLI Pin Deploy Workflow

PR #8 `Deploy to Vercel` failed after commit `2dfae998` because the workflow ran
`npm install -g vercel@latest`.

Current npm metadata showed:

- `vercel@latest = 54.8.0`
- dependency `@vercel/express = 0.1.96`
- runner failure: registry 404 for `@vercel/express-0.1.96.tgz`

Fix:

- added `VERCEL_CLI_VERSION=44.7.3`
- changed install to `npm install -g "vercel@${VERCEL_CLI_VERSION}"`
- added `vercel --version` in the install step
- added `.github/workflows/deploy-musu-bee.yml` to PR path filters

Validation:

- `npm view vercel dist-tags version dependencies --json`
- `npm view vercel@44.7.3 dependencies.@vercel/express dependencies.@vercel/node dependencies.@vercel/next --json`
- `npx -y vercel@44.7.3 --version` printed `Vercel CLI 44.7.3`
