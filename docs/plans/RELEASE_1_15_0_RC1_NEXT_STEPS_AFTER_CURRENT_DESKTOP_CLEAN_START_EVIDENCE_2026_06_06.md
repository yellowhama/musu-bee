# Next Steps After Current Desktop Clean-Start Evidence

**Date**: 2026-06-06 KST

## Current Position

The current installed MUSU Desktop build is healthy on `HUGH_SECOND`:

- local MSIX install: strict evidence passes
- single-machine local runtime: passes as `local-bridge-only`
- desktop-open CPU: passes for 60 seconds with owned WebView2
- runtime CPU matrix: passes all five scenarios with a successful local
  post-route probe

This is not enough for public release. The release blocker is no longer this
machine's local packaged desktop behavior; it is missing second-PC and hosted
external proof.

## Immediate Next Actions

1. Install the current MSIX on the second Windows PC.
2. Run the second-PC release check wrapper from the current kit.
3. Import the second-PC return archive on `HUGH_SECOND`.
4. Run a real two-machine route/multi-device smoke and record release-grade
   evidence.
5. Configure live MUSU.PRO P2P control-plane storage/auth and capture passing
   hosted evidence.
6. Verify `musu@musu.pro` mailbox delivery.
7. Record Partner Center, certification, and restricted capability evidence.
8. Re-run clean `write-release-go-no-go.ps1 -Json`.

## Second-PC Evidence Required

The second PC must produce:

- MSIX install evidence
- single-machine smoke evidence
- `desktop-open` runtime idle CPU evidence
- full runtime CPU scenario matrix evidence
- targeted route attempt evidence from/to the known peer
- multi-device route smoke evidence
- process ownership, startup single-instance, and desktop single-instance
  evidence if the wrapper reports them stale or missing

## Hosted MUSU.PRO Evidence Required

The hosted control-plane gate remains open until evidence proves:

- live owner-scoped P2P storage is configured
- relay lease storage is release-grade and owner-scoped
- `relay_default_data_path=false`
- relay connect status/transport descriptor and payload endpoint are wired
- owner-scoped release-grade relay route evidence exists
- relay transport proof is valid and bound to the route peers
- relay payload delivery proof is present and release-grade

## Product Direction To Preserve

Do not turn MUSU.PRO into the executor. The next implementation should preserve
this split:

- web: remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and evidence
- local desktop: execution, local bridge, local resource budget, local file/app
  access, and P2P traffic
- data path after web-assisted rendezvous: direct P2P first, relay fallback
  only when direct paths fail

## Acceptance Criteria

The next release-state update is acceptable when:

- clean go/no-go has no local runtime evidence blocker,
- second-PC CPU and matrix counts are `2/2`,
- a targeted second-PC route attempt is recorded,
- real multi-device evidence is recorded,
- live hosted P2P proof passes without `AllowUnverified`,
- support mailbox and Store gates have operator evidence, and
- the final tree is clean and pushed.
