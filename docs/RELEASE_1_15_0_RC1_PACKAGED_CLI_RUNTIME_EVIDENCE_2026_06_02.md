# MUSU 1.15.0-rc.1 Packaged CLI and Runtime Evidence Audit

**Wiki ID**: wiki/535
**Date**: 2026-06-02
**Scope**: fresh MSIX install after the Windows CLI pipe fix, packaged CLI pipe proof, primary smoke/CPU/matrix refresh, live `musu.pro` P2P control-plane recheck, and qualitative release status.

## Verdict

MUSU is still **No-Go for public desktop release**.

The primary package is materially better than the last audit:

- fresh local-sideload MSIX built and installed on `HUGH_SECOND`
- packaged WindowsApps CLI no longer hangs in the direct PowerShell JSON pipe
- packaged desktop repeated activation now stays at one shell
- startup single-instance and process ownership pass
- current primary single-machine smoke, desktop-open CPU, and 4-state CPU matrix pass
- live `https://musu.pro` public UI is already deployed and still passes scroll/logo/emerald QA

Remaining release blockers are not the public website UI:

- second-PC desktop-open CPU evidence
- second-PC 4-state CPU matrix evidence
- release-grade multi-device route evidence
- production `musu.pro` relay lease KV/storage env
- `musu@musu.pro` delivery evidence
- Partner Center / Microsoft Store evidence

## Qualitative Evaluation

| Area | Status | Qualitative score | Notes |
| --- | --- | ---: | --- |
| Primary Windows package | strong primary evidence | 93% | Fresh MSIX install, packaged CLI pipe, desktop single-instance, startup single-instance, ownership, smoke, CPU, and matrix all pass on `HUGH_SECOND`. |
| Idle/busy-loop risk | not reproduced on primary | 82% | Current desktop-open CPU max is `0.23%` of one logical CPU, hot process count `0`, owned Node `0`, owned WebView2 `6`. Two-machine proof is still required. |
| Public website | deployed and verified | 100% for scroll/logo/accent scope | `https://musu.pro` passed `/`, `/landing`, `/pricing`, and `/install` on desktop/mobile for scroll, favicon-header logo, `.musu-public-scroll-root`, and `#24C8DB`. |
| P2P control plane | auth deployed, KV/storage blocked | 55% | Live status is logged in and wired. `MUSU_P2P_CONTROL_TOKEN_SHA256S` was synced through the Vercel production workflow and the blocker moved from auth to `p2p_relay_lease_kv_not_configured`. |
| Release readiness | No-Go | 74% | Primary Windows quality is no longer the main blocker; external evidence and hosted auth remain. |

## Evidence Recorded

Fresh package and CLI pipe:

- MSIX artifact: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged CLI pipe evidence: `docs\evidence\cli-pipe\1.15.0-rc.1\20260602-032728-HUGH_SECOND.packaged-cli-pipe.evidence.json`
- result: `ok=true`, `returned_without_hang=true`, duration `7544ms`, bridge status `ok`

Primary runtime evidence:

- single-machine smoke: `docs\evidence\single-machine\1.15.0-rc.1\20260602-033029-HUGH_SECOND.evidence.json`
- desktop single-instance: `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-033145-HUGH_SECOND.desktop-single-instance.json`
- startup single-instance: `docs\evidence\startup-single-instance\1.15.0-rc.1\20260602-033225-HUGH_SECOND.startup-single-instance.json`
- process ownership: `docs\evidence\process-ownership\1.15.0-rc.1\20260602-033257-HUGH_SECOND.process-ownership.json`
- desktop-open CPU: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-033412-HUGH_SECOND.desktop-open.evidence.json`
- 4-state CPU matrix: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-033636-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Runtime highlights:

- desktop repeated activation: before `0`, after `1`, new shell `1`
- startup repeated spawn: `0`, stable bridge pid count `1`
- process ownership: runtime `1`, desktop shell `1`, owned Node `0`, owned WebView2 `6`, machine-wide Node `19`, orphan repo helpers `0`
- desktop-open CPU: `60.071s`, hot process count `0`, max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, working set `445.87MB`
- 4-state matrix token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_033636`

Live P2P evidence:

- evidence: `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-034756-musu.pro.evidence.json`
- relay status: logged in, rendezvous wired, relay lease endpoint wired, `relay_default_data_path=false`
- relay leases: `ok=false`, `owner_scope_verified=false`
- live error: `p2p_control_auth_not_configured`, `accepted_auth_modes=[]`

P2P deployment/evidence addendum:

- deploy workflow commit: `3be37e54a30bbd0bee95e9b2e22ce27d0450846c`
- Vercel production deploy: GitHub Actions run `26776054030`, success, workflow_dispatch
- Tests after workflow change: run `26775836294`, success
- initial post-push deploy: run `26775836280`, success, but skipped P2P env because the GitHub secret was not yet populated
- final env-sync workflow verification: commit `9a3ec52df102d36075f245bdab526dc57fb99e08`, deploy run `26776909275` success, Tests run `26776909221` success; deploy synced `MUSU_P2P_CONTROL_TOKEN_SHA256S`, skipped missing KV/relay env by name, and aliased `https://musu.pro`
- current evidence after env sync: `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`
- current error: `relay_lease_query_failed`, detail `p2p_relay_lease_kv_not_configured`
- interpretation: production P2P auth is no longer the active blocker; hosted relay lease storage now requires `KV_REST_API_URL` and `KV_REST_API_TOKEN` or an equivalent Vercel KV/Upstash Redis binding.

## Code Audit

Findings:

1. **Fixed** - packaged CLI pipe hang.
   The installed WindowsApps CLI now returns from `up --json | ConvertFrom-Json`; the bridge no longer holds the caller stdout pipe open after JSON emission.

2. **Product-risk open** - `musu.pro` relay lease storage is not configured.
   The deployed code path now accepts the runtime/control token hash, but production cannot query owner-scoped relay lease records because Vercel KV/Upstash Redis credentials are missing.

3. **Environment-risk open** - developer PATH shadows the packaged alias.
   On `HUGH_SECOND`, `C:\Users\empty\.cargo\bin\musu.exe` appears before `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`. Explicit WindowsApps proof passes, but release install evidence should continue flagging this because normal `musu.exe` resolution can hit the dev binary.

4. **Clarified** - the observed many `node.exe` processes are not MUSU-owned.
   Process ownership evidence sees machine-wide Node `19`, but owned Node `0` and orphan repo helpers `0`. They are Codex/MCP/temporary dev-server processes, not MUSU runtime leakage.

5. **Still missing** - second-PC runtime and real route proof.
   Primary evidence is good, but the release gates deliberately require another machine and release-grade multi-device proof.

## Deployment Interpretation

No additional website UI deploy is needed for the scroll/logo/emerald request. Live `musu.pro` already serves the change.

The remaining `musu.pro` task is operational/server-side:

1. provision or attach Vercel KV / Upstash Redis for the `musu.pro` project
2. set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in GitHub repository secrets or Vercel production env
3. set relay policy env only when the transport is intentionally wired: `MUSU_P2P_RELAY_ENABLED`, `MUSU_P2P_RELAY_TRANSPORT_WIRED`, `MUSU_P2P_RELAY_URL`, and `MUSU_P2P_RELAY_ENTITLEMENT`
4. trigger the Vercel production deploy/reload path
5. rerun `record-p2p-control-plane-evidence.ps1` without `-AllowUnverified`
6. require `owner_scope_verified=true` and `relay_default_data_path=false`

## Next Steps

1. Run the second-PC desktop-open CPU evidence from the fresh package.
2. Run the second-PC 4-state CPU matrix evidence from the fresh package.
3. Capture release-grade multi-device route evidence.
4. Configure and verify production `musu.pro` P2P relay lease KV/storage.
5. Record `musu@musu.pro` actual receive/forward delivery evidence.
6. Record Partner Center / Microsoft Store package submission and certification evidence.
7. Re-run go/no-go only after the above evidence exists.

## Indexing

After the P2P auth/KV blocker addendum and next-action documentation,
`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
1255 files and 2214 symbols.
