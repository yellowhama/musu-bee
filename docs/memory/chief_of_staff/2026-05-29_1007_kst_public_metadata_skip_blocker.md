# 2026-05-29 10:07 KST - Public Metadata Skip Blocker

## Change

`scripts\windows\write-release-go-no-go.ps1 -SkipPublicMetadata` now records a
`store-public-metadata` blocker instead of a warning.

## Reason

The public desktop release gate must prove live privacy/support metadata before
it can return `ready_for_public_desktop_release=true`. The skip option remains
useful for offline diagnostics and isolated smoke tests, but it must not allow a
public release decision.

## Current Rule

For public release readiness:

- `public_metadata_checked=true`
- `public_metadata_ok=true`
- `/privacy` and `/support` must verify against the configured public base URL

Skipping metadata verification leaves the release No-Go.
