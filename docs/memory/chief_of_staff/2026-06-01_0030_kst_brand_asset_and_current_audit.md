# CoS Memory: Brand Asset Audit and Current Release State

**Date**: 2026-06-01 00:30 KST
**Scope**: MUSU 1.15.0-rc.1 Store/Desktop release readiness.

Durable updates:

- The official app/favicon mark currently comes from `musu-bee/src-tauri/icons/icon.png`.
- Web references to `/images/favicon-header.png` were backed by local files but not tracked because `musu-bee/.gitignore` ignored all `public/`.
- Required public runtime images are now tracked: `musu-bee/public/images/favicon-header.png` and `musu-bee/public/agents/*.png`.
- `MusuLogo` now renders the tracked app mark plus a MUSU text wordmark instead of referencing missing `/images/logos/*` PNG assets.
- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_01.md` (wiki/527) is the latest qualitative/code-audit addendum.
- `npm run typecheck` passed after the logo/public asset fix.
- A current single-machine smoke attempt on commit `5e8d195` failed during dashboard task-status polling. The bridge stayed healthy at `http://127.0.0.1:10954`, but the dashboard became unreachable and PowerShell log-tail commands hit OOM/CLR errors. No new release evidence was recorded.
- P2P control-plane status remains: Rust cloud DTO/client methods exist, but bridge route selection still uses local/manual peer discovery and does not create rendezvous sessions or submit hardened route evidence.

Next operators should not claim public release readiness from this run. Refresh single-machine smoke on a stable host, then collect two-machine desktop-open CPU evidence and real route evidence.
