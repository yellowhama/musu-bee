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

## Release interpretation

- The installed MSIX/local-sideload package is not fixed until rebuilt and
  reinstalled.
- Previous desktop-open CPU/process evidence is source-stale after this code
  change.
- Next hard gate: build/install a fresh package, run packaged desktop
  repeated-activation evidence, then refresh primary and second-PC CPU/matrix.
- Public site changes should deploy to `musu.pro` after push; live QA must be
  repeated on `/`, `/landing`, `/pricing`, and `/install`.
