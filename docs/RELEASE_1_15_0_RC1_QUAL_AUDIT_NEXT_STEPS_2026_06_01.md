# MUSU 1.15.0-rc.1 Qualitative Audit and Next Steps

**Wiki ID**: wiki/527
**Date**: 2026-06-01
**Status**: Current audit addendum after MSIX desktop-entrypoint hardening, logo/public asset audit, and local smoke recheck attempt.

## Executive Verdict

MUSU is materially stronger than the earlier Store-candidate state, but it is
still **No-Go for public desktop release**.

The product now has a credible Windows package boundary: Store/MSIX artifacts
launch `musu-desktop.exe`, the CLI alias remains `musu.exe`, startup remains
`musu-startup.exe`, process ownership distinguishes MUSU-owned WebView2 from
machine-wide WebView2, and the idle polling/writer wakeup fixes remove obvious
busy-loop sources.

The remaining release blocker is not cosmetic. The product still needs clean
current single-machine smoke, two-machine desktop-open idle CPU evidence, and a
real multi-device route that satisfies the hardened route-evidence contract.
`musu.pro` currently has client DTOs for rendezvous and route evidence, but the
runtime route selector is not yet using the hosted control plane.

## Product Spec Updates

1. **Official app mark**: the current usable product mark is the Tauri/MSIX app
   icon under `musu-bee/src-tauri/icons/`. It is good enough to serve as the
   first Store/app/favicon mark.
2. **Web/logo source of truth**: `musu-bee/public/images/favicon-header.png`
   now reuses the same app mark for web headers and auth/app gates.
3. **Wordmark behavior**: `MusuLogo` no longer points at missing
   `/images/logos/*` PNG lockups. It renders the tracked app mark plus a MUSU
   text wordmark, with light/dark/yellow variants expressed through brand
   tokens.
4. **Public runtime assets**: `musu-bee/public/agents/*.png` and
   `musu-bee/public/images/favicon-header.png` are release assets and must be
   tracked in git. They are not user data.
5. **P2P control-plane boundary**: `musu.pro` remains the account-scoped
   registry/rendezvous/path-selection/relay-control plane. It must not become
   the default payload path except when the route evidence says `relay` and the
   user/account policy allows it.

## Code Audit Findings

| Area | Severity | Finding | Status |
|---|---:|---|---|
| Web assets | High | `musu-bee/.gitignore` ignored the entire `public/` tree, while code referenced `/images/favicon-header.png` and `/agents/*.png`. A clean checkout could miss visible product assets. | Fixed in commit `5e8d195`: required public image assets are now unignored/tracked. |
| Logo component | Medium | `MusuLogo` referenced `/images/logos/{hero,display,header}-{variant}.png`, but those files are not present in the repo. | Fixed in commit `5e8d195`: component uses the tracked app mark plus token-colored wordmark. |
| Runtime smoke | High | Current single-machine smoke initially could not be refreshed after the logo asset commit. The dashboard task status API timed out once, then the fixed expected CLI string hit a duplicate-task `409 Conflict`. | Fixed in `smoke-single-machine-beta.ps1`: per-run expected strings avoid duplicate task hashes, dashboard task polling retries within the deadline, and polling errors are recorded in evidence. |
| mDNS/Tailscale IPv6 | High | `mdns_sd::service_daemon` can repeatedly send to Tailscale IPv6 link-local multicast and log `os error 10065`, then `closed channel`. This is a credible idle CPU/log-noise source when mDNS is enabled or `musu discover` runs. | Fixed in `musu-rs/src/peer/mdns.rs`: mDNS stays opt-in, and IPv6 mDNS is separately opt-in via `MUSU_MDNS_ENABLE_IPV6=1`; default daemon setup disables IPv6 interfaces. |
| P2P route | High | `musu-rs/src/cloud/mod.rs` has rendezvous/route-evidence DTOs and client methods, but `musu-rs/src/bridge/router.rs` still selects from local/manual peers and does not create rendezvous sessions or submit hardened route evidence. | Pending P0. |
| Multi-device verifier | High | `smoke-multidevice-beta.ps1` honestly records legacy manual HTTP bearer route evidence with `peer_identity_verified=false`, `encryption=none_http_bearer`, and `handshake_ms=null`; verifier rejects that for release. | Correctly blocked. |

## Validation Run

- `npm run typecheck` passed in `musu-bee`.
- `git diff --check` passed, with only CRLF normalization warnings before the
  asset commit.
- Earlier single-machine smoke attempted on commit `5e8d195` but failed while
  polling dashboard task status:
  `Invoke-RestMethod ... /api/bridge/tasks/<id>` timed out after 15 seconds.
- After smoke hardening, local smoke on commit `31c5ee7` produced passing
  `.local-build` evidence `20260601-003017-HUGH_SECOND` with
  `dashboard_task_poll_error_count=0` and unique CLI output
  `MUSU_CLI_ROUTE_OK_20260601_003017`.
- `cargo check -j 1` and `cargo build --bin musu -j 1` passed after the mDNS
  IPv6 hardening.
- `musu discover --timeout 2` completed without the Tailscale IPv6 mDNS
  `os error 10065` log spam when `MUSU_MDNS_ENABLE_IPV6` was unset.

The release gate still needs committed/recorded single-machine evidence after
the mDNS hardening commit and then two-machine desktop-open CPU evidence.

## Qualitative Evaluation

| Dimension | Current score | Notes |
|---|---:|---|
| Packaging trust | 8/10 | MSIX desktop-entrypoint and local-sideload contract are now coherent. Store certification remains external. |
| Runtime efficiency | 6/10 | Busy-loop mitigations landed and local CPU samples are promising, but two-machine packaged desktop evidence is still missing. |
| P2P product story | 5/10 | The strategy is right, but the implementation still depends on manual/direct paths. `musu.pro` rendezvous is not wired into routing yet. |
| UX/branding | 6/10 -> 7/10 | App mark is strong. Public web asset tracking and wordmark fallback are now fixed. Full marketing lockups/screenshots are still needed. |
| Release evidence quality | 7/10 | Gates are strict and honest. The latest smoke failure shows the gate is catching real local instability instead of papering it over. |
| Overall public readiness | ~58% | Stronger than before, but still No-Go because current smoke, second-PC CPU, real route, support inbox, and Store evidence remain open. |

## Next Roadmap

1. **Refresh current single-machine evidence on a stable host**
   - Close unrelated old WebView2/Node/dev-server processes.
   - Start one dashboard server on `127.0.0.1:3000`.
   - Run `smoke-single-machine-beta.ps1`.
   - Record evidence only if it verifies against current HEAD or doc/evidence-only delta.

2. **Finish runtime evidence on two PCs**
   - Run `measure-musu-idle-cpu.ps1` with `desktop-open`,
     `-RequireOwnedWebView2`, `-IncludeNode`, and `-IncludeWebView2`.
   - Record both primary and second-PC evidence.
   - Keep the 60s / 5%-of-one-core / owned process count / memory budgets.

3. **Wire `musu.pro` assisted routing**
   - Add local/server stub endpoints for rendezvous.
   - Add direct LAN/Tailscale candidate path selection before relay.
   - Add `musu route --explain` and `musu relay status`.
   - Submit `musu.route_evidence.v1` from actual runtime route attempts.

4. **Re-run multi-device release proof**
   - Use second-PC returned handoff for candidate addresses.
   - Produce passing route evidence with peer identity, timing, encryption, and
     payload-transit truth.
   - Record evidence only after the verifier accepts it.

5. **Complete external gates**
   - Verify `musu@musu.pro` inbox delivery with token evidence.
   - Submit the Store-reviewed MSIX in Partner Center.
   - Record product-name reservation, certification, restricted capability
     approval, and Store release evidence.

## Decision

Do not publish yet. The right next engineering move is to stabilize the release
test host, refresh current single-machine evidence, then implement the first
`musu.pro` assisted direct route before touching relay transport.
