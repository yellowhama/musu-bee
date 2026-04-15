# MUS-1688 Risk Notes

## Trust Boundary
- Scope is presentational token usage in static CSS/TSX under `src/app`.
- No untrusted user input is interpolated into CSS variable names/values.
- Waitlist input remains sent to existing backend endpoint via normal form POST; style layer does not consume user-provided data.

## Race Risk
- Changes are static asset and compile-time rendering updates.
- No new async shared-state mutation path introduced in this scope.
- Existing race profile for waitlist API remains unchanged.

## Rollback
- Revert only scoped files listed in `changed_files.md`.
- Minimal rollback command set (from repo root):
  - `git checkout -- musu-bee/src/app/globals.css`
  - `rm -rf musu-bee/src/app/landing-exp`
  - `rm -f musu-bee/src/app/brand-tokens.test.ts`
- Re-run proof commands after rollback to confirm baseline restoration.
