# 2026-06-04 Vercel CLI Pin Deploy Workflow

PR #8 `Deploy to Vercel` failed after commit `2dfae998` because the workflow ran
`npm install -g vercel@latest`.

Current npm metadata showed:

- `vercel@latest = 54.8.0`
- dependency `@vercel/express = 0.1.96`
- runner failure: registry 404 for `@vercel/express-0.1.96.tgz`

Final fix:

- added `VERCEL_CLI_VERSION=54.7.1`
- changed install to `npm install -g "vercel@${VERCEL_CLI_VERSION}"`
- added `vercel --version` in the install step
- added `.github/workflows/deploy-musu-bee.yml` to PR path filters

Note:

- `44.7.3` installed but Vercel deploy rejected it as too old; the endpoint
  requires `47.2.2` or later.
- `54.7.1` uses `@vercel/express=0.1.95`, avoiding the missing
  `@vercel/express=0.1.96` package used by `54.8.0`.

Validation:

- `npm view vercel dist-tags version dependencies --json`
- `npx -y vercel@44.7.3 --version` printed `Vercel CLI 44.7.3`
- `npm view vercel@54.7.1 dependencies.@vercel/express dependencies.@vercel/node dependencies.@vercel/next --json`
- `npx -y vercel@54.7.1 --version` printed `Vercel CLI 54.7.1`
