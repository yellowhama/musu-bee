# MUSU 1.15.0-rc.1 Vercel CLI Pin Deploy Workflow

Date: 2026-06-04
Wiki ID: wiki/656

## Summary

PR #8 deploy check failed after commit `2dfae998` because the deploy workflow
installed `vercel@latest`. At the time of validation, npm reported
`vercel@latest` as `54.8.0`, which depends on `@vercel/express@0.1.96`; the
runner then failed with a registry 404 for that tarball.

The deploy workflow now pins the Vercel CLI:

- `VERCEL_CLI_VERSION=54.7.1`
- `npm install -g "vercel@${VERCEL_CLI_VERSION}"`
- `vercel --version`

The pull-request path filter also includes `.github/workflows/deploy-musu-bee.yml`
so workflow edits participate in the PR deploy check.

An initial `44.7.3` pin installed successfully but was rejected by the Vercel
deploy endpoint as too old. The endpoint requires `47.2.2` or later, so the pin
was moved to `54.7.1`.

## Validation

- `npm view vercel dist-tags version dependencies --json`: confirmed
  `latest=54.8.0` and `@vercel/express=0.1.96`
- `npx -y vercel@44.7.3 --version`: pass, but subsequent PR deploy rejected
  it as below the endpoint minimum
- `npm view vercel@54.7.1 dependencies.@vercel/express dependencies.@vercel/node dependencies.@vercel/next --json`:
  confirmed `@vercel/express=0.1.95`, `@vercel/node=5.8.9`, and
  `@vercel/next=4.17.5`
- `npx -y vercel@54.7.1 --version`: pass, printed `Vercel CLI 54.7.1`

## Release Interpretation

This is CI/deploy hardening only. It does not change runtime behavior, relay
payload transport, or the public release No-Go state. It prevents transient
`latest` package regressions from blocking deploy evidence.
