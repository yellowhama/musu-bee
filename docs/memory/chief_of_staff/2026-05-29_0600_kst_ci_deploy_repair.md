# CoS Memory Note - Release CI And Deploy Repair (2026-05-29 06:00 KST)

Facts:

- GitHub Actions were stale after the Rust/Next consolidation:
  - `.github/workflows/test.yml` still referenced deleted Python `musu-core/` and `musu-bridge/`.
  - `.github/workflows/e2e-musu-bee.yml` still referenced deleted `musu-port/` and omitted the required Rust toolchain input.
  - `.github/workflows/deploy-musu-bee.yml` used Node 20, which cannot import server routes using `node:sqlite`.
- `musu-bee/package.json` now requires Node `>=22.12.0`.
- Deploy and CI web checks now use Node 22.
- Likely legacy required check names are preserved: `test` remains as an aggregate Tests job and the E2E job remains `Playwright E2E`.
- Playwright CI smoke now uses `musu-bee/playwright.ci.config.ts` and verifies `/privacy` plus `/support` Store metadata content.

Verification:

- `npm run build` passed.
- `npm run typecheck` passed.
- `npm run test:e2e:ci` passed 2 Store metadata Playwright tests.
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -- --test-threads=1` passed 235 tests.

Decision:

- Treat green GitHub Actions and live `verify-store-public-metadata.ps1 -BaseUrl https://musu.pro` as required before Partner Center submission.
- Keep legacy broad E2E specs out of required CI until they are updated for the current product routes and bridge model.
