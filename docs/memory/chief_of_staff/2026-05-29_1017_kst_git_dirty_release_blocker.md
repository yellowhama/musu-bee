# 2026-05-29 10:17 KST - Git Dirty Release Blocker

## Change

`scripts\windows\write-release-go-no-go.ps1` now treats a dirty git worktree as
a release blocker instead of a warning.

Updated memory/index surfaces:

- `docs\WIKI.md`
- `docs\WIKI_INDEX.md`
- `docs\GOAL.md`
- `docs\DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`

## Reason

Final readiness already requires `manifest_git.dirty=false`, but the go/no-go
script only warned on uncommitted changes. If all external evidence had been
recorded while the worktree was dirty, the script could have reported
`ready_for_public_desktop_release=true` with a stale or unreproducible manifest.

## Current Rule

Public desktop release readiness requires a clean committed state and a
regenerated release manifest showing `manifest_git.dirty=false`. Dirty git
status is now a blocker in `write-release-go-no-go.ps1`.
