# 2026-06-02 00:17 KST — Desktop Single-Instance and Public Site Follow-up

## What changed

- Reproduced a real packaged desktop repeated-activation issue on
  `HUGH_SECOND`: one `musu-desktop.exe` shell became three processes after
  repeated Start-menu activation of
  `Yellowhama.MUSU_ygcjq669as2b6!MUSU`.
- Added Tauri source hardening with `tauri-plugin-single-instance = 2.4.2`.
  Repeat activation now focuses, unminimizes, and shows the existing `main`
  window.
- Updated the public site source so the visible logo is the favicon mark only,
  public scroll rules are explicit, and the homepage `Open App` CTA uses the
  emerald `#24C8DB` point color.

## Validation

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed
  5/5.
- `npm run typecheck` passed.
- `npx playwright test --config=playwright.public-site.config.ts` passed 8/8.
- `npm run build` passed.
- `git diff --check` passed.
- Commit `0ed3673a27b058ad1fc5d050434bf8435cb21e5d` deployed to
  `musu.pro`: Vercel production run `26764307713`, GitHub `Tests` run
  `26764309477`, and `E2E Tests - musu-bee` run `26764310368` passed.
- Production Playwright QA against `https://musu.pro` passed 8/8 on `/`,
  `/landing`, `/pricing`, and `/install`.

## Release interpretation

- The installed MSIX/local-sideload package is not fixed until rebuilt and
  reinstalled.
- Previous desktop-open CPU/process evidence is source-stale after this code
  change.
- Next hard gate: build/install a fresh package, run packaged desktop
  repeated-activation evidence, then refresh primary and second-PC CPU/matrix.
- Public site changes are deployed and live-QA'd on `musu.pro`.
