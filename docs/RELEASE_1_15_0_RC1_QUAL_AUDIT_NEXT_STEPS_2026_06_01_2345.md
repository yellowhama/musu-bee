# MUSU 1.15.0-rc.1 Current Qualitative Audit and Next Steps

**Wiki ID**: wiki/531
**Date**: 2026-06-01 23:45 KST
**Status**: Current qualitative assessment after public-site deploy verification, primary single-machine evidence refresh, primary desktop-open CPU refresh, and primary 4-state runtime CPU matrix refresh.

## Verdict

MUSU is **single-machine Windows beta usable**, but still **No-Go for public desktop release**.

The last round of work improved confidence in three areas:

1. `musu.pro` public site deployment is real, not pending. The scroll/logo/emerald accent fix was deployed through GitHub Actions/Vercel and live QA passed.
2. The operator-reported busy-loop pattern is **not reproduced on the current primary machine** in 60s source-clean samples.
3. Machine-wide Node.js process noise is now separated from MUSU-owned and repo-related Node processes. The many Node processes visible on this machine are mostly Codex/MCP/npx helper processes; MUSU-owned Node is still zero in ownership audit, and the single repo-related Node in CPU evidence is the test-only `next start -p 3001` dashboard used for matrix verification.

Public release remains blocked by evidence and product gaps:

- packaged desktop repeated activation evidence from the installed MSIX
- second-PC `desktop-open` CPU evidence
- second-PC 4-state runtime CPU matrix evidence
- release-grade multi-device route evidence with verified peer identity and QUIC/TLS transport proof
- live `musu.pro` P2P control-plane auth/env verification
- `musu@musu.pro` inbox receive/delivery evidence
- Partner Center / Microsoft Store submission and certification evidence
- relay/tunnel payload transport, if relay is to be advertised beyond policy/audit wiring

## Current Evidence

Public site:

- Commit `b08ed746` deployed to `musu.pro` through Vercel production run `26759256616`.
- GitHub `Tests` run `26759256487` and `E2E Tests - musu-bee` run `26759256574` passed.
- Live Playwright QA with `qa=b08ed746` passed on `/`, `/landing`, `/pricing`, and `/install` for desktop and mobile.
- Verified signals: actual scroll movement, no horizontal overflow, `.musu-public-scroll-root=true`, favicon-header logo source, `data-brand-accent=emerald`, and `--musu-color-brand-emerald=#24C8DB`.

Primary runtime evidence after that source change:

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-231612-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-231939-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- Single-machine smoke passed with dashboard task `900260dc-d0d1-4ac6-9503-0001b4a2f451`, bridge `http://127.0.0.1:4752`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_231552`, and CLI route checked.
- Desktop-open CPU passed from clean source commit `afd1ceab2db2b234c6c4d9f50a5a165830bfae65`: 60.058s sample, MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.1`, working set `510.13MB`, private memory `331.46MB`, and no hot processes.
- Runtime CPU matrix passed from clean source commit `5434b4caf0c5e0f5a8dd345e775cb45259e4ebbd`: `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all sampled for 60s with `git_dirty=false`, dashboard URL `http://127.0.0.1:3001/app` launched, post-route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`, no hot processes, and verifier `ok=true`.

## Product Spec Updates

1. **Public web channel**: `musu.pro` is the canonical public web surface and is already serving the favicon-header mark plus emerald accent. Further web deploys should use GitHub Actions; local Vercel CLI access is not the authority for this project.
2. **Desktop beta scope**: the Store/MSIX desktop app remains a launcher/status shell plus dashboard handoff, not yet a full native dashboard.
3. **CPU evidence model**: public readiness requires two independent layers on two Windows machines: `desktop-open` idle CPU evidence and the 4-state runtime CPU matrix.
4. **Node attribution**: machine-wide Node count is diagnostic only. Release evidence distinguishes MUSU-owned descendants, repo-related helpers, and unrelated operator tooling.
5. **P2P network role**: `musu.pro` is required as registry/rendezvous/route-evidence/relay-lease control plane for public multi-device setup, but it must not silently become the payload path. Relay remains fail-closed until transport exists and evidence says `route_kind=relay`.
6. **Support address**: `musu@musu.pro` is the release support mailbox. Do not use `support@musu.pro` in current release materials.
7. **Desktop single-instance**: source uses the Tauri single-instance plugin, but the release contract is the installed package behavior. Repeated Start-menu/AppsFolder activation must leave at most one `musu-desktop.exe` shell and must pass `desktop_single_instance_verified=true`.

## Code Audit

Findings:

1. **No current primary busy-loop evidence**: latest primary 60s samples stay far below the 5% of one logical core budget. This lowers immediate CPU concern on `HUGH_SECOND`, but does not close the operator report until second-PC evidence is captured.
2. **Node process concern is explained but should stay visible**: the system had many Node processes, but command-line audit attributes them to Codex/MCP/npx tooling. The only repo-related Node during matrix capture was the local Next dashboard on port `3001`, used to make `dashboard-open` a real scenario. That test server must be stopped after verification.
3. **Desktop shell duplicate-launch risk is now evidence-gated**: repeated manual launches can still accumulate stale `musu-desktop.exe` windows in the currently installed package. The source fix exists, but local evidence `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json` still fails until a fresh MSIX is built and installed. This is separate from `musu up` bridge single-instance, which already has a passing gate.
4. **P2P control-plane live gate is correctly failing**: current `musu.pro` evidence fails on `p2p_control_auth_not_configured`. This is safer than passing locally while production auth is missing.
5. **mDNS/Tailscale log issue is controlled by defaults**: the repeated `ff02::fb%9` / `os error 10065` pattern is a real stale/opt-in risk, but current Store-candidate defaults keep mDNS, IPv6 mDNS, Tailscale mDNS, and VPN/virtual mDNS off unless explicitly enabled.

No new code defect was found in the latest evidence refresh itself. The main unresolved issues are release scope and missing two-machine/production evidence.

## Next Roadmap

P0 before any public Store launch:

1. Configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth on `musu.pro`, then record passing P2P control-plane evidence without `-AllowUnverified`.
2. Build and install a fresh MSIX from the current source, then run `audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3 -FailOnProblem -Json`.
3. Stop test-only local dashboard Node after evidence capture, then confirm process ownership remains one runtime, at most one desktop shell, zero MUSU-owned Node, and expected WebView2 helpers.
4. Run the second-PC release wrapper again so the return archive includes `desktop-open` CPU evidence and the 4-state runtime CPU matrix.
5. Import the second-PC return archive and rerun go/no-go. Runtime gates should move from `1/2` to `2/2` only if both machines are source-current and clean.
6. Capture real multi-device route evidence with release-grade peer identity and `quic_tls_1_3` transport proof; same-machine or HTTP bearer evidence remains insufficient.
7. Record `musu@musu.pro` inbox delivery evidence.
8. Submit the current Store-reviewed MSIX in Partner Center and record reservation/submission/certification/restricted-capability evidence.

P1 after those gates:

- Replace the local installed package and keep packaged desktop single-instance evidence current after any shell/package source change.
- Implement relay/tunnel data transport only after direct QUIC/TLS route proof is stable.
- Regenerate final operator packet/action pack from clean final HEAD.
- Refresh public docs, Store listing copy, screenshots, and indexer after the final evidence commit.
