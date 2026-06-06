# MUSU `musu.pro` P2P Control-Plane Next Actions

**Date**: 2026-06-02  
**Scope**: hosted P2P control-plane, relay lease storage, and production deploy evidence for `1.15.0-rc.1`.

## Current Status

The public website UI is already deployed to `https://musu.pro` and currently
passes desktop/mobile scroll, favicon-mark logo, and emerald accent checks.

The hosted P2P control-plane advanced one blocker:

- Previous blocker: `p2p_control_auth_not_configured`
- Current blocker: `p2p_relay_lease_kv_not_configured`

Evidence:

- Deploy commit: `3be37e54a30bbd0bee95e9b2e22ce27d0450846c`
- Production deploy run: `26776054030`, success
- Tests run: `26775836294`, success
- Current P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`

Fresh 2026-06-02 21:56 KST recheck:

- Current P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`
- Verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.verification.json`
- Status: `ok=false`
- Passing facts: logged in, rendezvous wired, relay lease control-plane wired,
  runtime relay fallback wired, and `relay_default_data_path=false`
- Failing facts: relay leases `ok=false`, `owner_scope_verified=false`,
  `owner_scoped=false`
- Current blocker:
  `p2p_relay_lease_kv_not_configured`

Interpretation: `MUSU_P2P_CONTROL_TOKEN_SHA256S` is now accepted in production.
The API reaches relay lease storage and fails closed because production has no
KV/Redis storage env.

## Immediate Operator Actions

0. Confirm the current hosted blocker without exposing secret values:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json
```

Current expected blockers before KV provisioning:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`

1. Provision Vercel KV / Upstash Redis for the `musu.pro` Vercel project.
2. Add either the Vercel KV names or the Upstash REST names for
   `yellowhama/musu-bee`:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - or `UPSTASH_REDIS_REST_URL`
   - and `UPSTASH_REDIS_REST_TOKEN`

Preferred command after KV values exist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -KvRestApiUrl "<KV_REST_API_URL>" `
  -KvRestApiToken "<KV_REST_API_TOKEN>" `
  -Deploy `
  -Json
```

Equivalent Upstash input:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -UpstashRedisRestUrl "<UPSTASH_REDIS_REST_URL>" `
  -UpstashRedisRestToken "<UPSTASH_REDIS_REST_TOKEN>" `
  -Deploy `
  -Json
```

The script sends values to `gh secret set` / `gh variable set` through stdin and
does not print secret values. By default, `KV_REST_API_URL` is stored as a repo
variable and `KV_REST_API_TOKEN` is stored as a repo secret. Use
`-StoreKvUrlAsSecret` if the URL must also be treated as secret. When Upstash
inputs are used, the script also sets the canonical `KV_REST_API_*` names so
the deployed app and `@vercel/kv` client can use the same storage path.

Dry-run without setting anything:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -KvRestApiUrl "<KV_REST_API_URL>" `
  -KvRestApiToken "<KV_REST_API_TOKEN>" `
  -DryRun `
  -Json
```

Manual fallback:

```powershell
gh variable set KV_REST_API_URL --repo yellowhama/musu-bee
gh secret set KV_REST_API_TOKEN --repo yellowhama/musu-bee
```

or:

```powershell
gh variable set UPSTASH_REDIS_REST_URL --repo yellowhama/musu-bee
gh secret set UPSTASH_REDIS_REST_TOKEN --repo yellowhama/musu-bee
```

3. Run the deploy workflow:

```powershell
gh workflow run deploy-musu-bee.yml --repo yellowhama/musu-bee --ref main
```

4. After the workflow succeeds, rerun hosted P2P evidence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\record-p2p-control-plane-evidence.ps1 `
  -MusuExe "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" `
  -BaseUrl https://musu.pro `
  -Version 1.15.0-rc.1 `
  -Json
```

5. Verify the evidence without `-AllowUnverified`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\verify-p2p-control-plane-evidence.ps1 `
  -EvidencePath <new evidence json> `
  -ExpectedBaseUrl https://musu.pro `
  -ExpectedVersion 1.15.0-rc.1
```

6. Re-run the env/status preflight and require it to pass:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-pro-p2p-env-status.ps1 -FailOnProblem
```

## Acceptance Criteria

P2P control-plane evidence is acceptable only when:

- `relay leases ok=true`
- `owner_scope_verified=true`
- `owner_scoped=true`
- `relay_default_data_path=false`
- no `p2p_control_auth_not_configured`
- no `p2p_relay_lease_kv_not_configured`

## 2026-06-04 Product Direction Update

The local program and the public web surface are separate products that work
together:

- the installed MUSU program on each device is the executor; it owns local
  files, shell/browser/app automation, the local bridge, and P2P traffic
- `musu.pro` is the coordination surface; it accepts remote user work orders,
  shows project rooms, brokers rendezvous, and records route/session evidence
- the web surface may queue or dispatch user input to an authenticated local
  MUSU runtime, but it must not pretend to execute local work in the cloud
- after `musu.pro` helps devices discover each other, clients should prefer the
  P2P mesh path order `lan`, `tailscale`, `direct_quic`, then `relay`

Project rooms are the intended collaboration model for multiple local MUSU
programs and their attached AIs working on the same project. A room should hold
work orders, presence, discussion, decisions, task handoffs, transcripts, audit
history, and route/session status. Actual work still runs on the participating
local machines.

Testing implication:

- a true other-computer connection test requires the current MUSU build
  installed and running on that other computer

## 2026-06-06 Current Desktop Evidence Update

Current HUGH_SECOND packaged desktop evidence is healthy after the latest
runtime relay candidate coverage carry:

- strict MSIX install evidence: `20260606-171011-HUGH_SECOND`
- single-machine smoke: `20260606-170759-HUGH_SECOND`, `local-bridge-only`,
  bridge `http://127.0.0.1:4751`
- desktop-open CPU: `20260606-171154-HUGH_SECOND.desktop-open`, hot `0`,
  WebView2 max one-core CPU `0.23`
- full runtime CPU matrix: `20260606-171403-HUGH_SECOND`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`, verifier `ok=true`

This does not close hosted P2P. It narrows the next work: install this current
desktop build on the second PC, capture route/CPU/matrix evidence there, then
finish live MUSU.PRO P2P storage/relay proof. MUSU.PRO should remain the
remote input/project-room/rendezvous/control-plane surface; local MUSU Desktop
programs still execute the work and own P2P traffic.
- until then, current testing is one-machine only: local smoke, process
  ownership, idle CPU, runtime CPU matrix, and packaged artifact verification
- second-PC evidence must be imported before claiming multi-device/P2P release
  readiness

## Relay Policy Boundary

Do not claim production relay payload transport until transport evidence exists.

Only set these when the actual relay/tunnel transport is intentionally wired:

- `MUSU_P2P_RELAY_ENABLED`
- `MUSU_P2P_RELAY_TRANSPORT_WIRED`
- `MUSU_P2P_RELAY_URL`
- `MUSU_P2P_RELAY_ENTITLEMENT`

`musu.pro` should remain the control plane for rendezvous, route evidence, and
fallback lease audit. It should not become the default data path.

## Current Release Blockers After This Step

Even after KV is fixed, public desktop release still needs:

- second-PC desktop-open CPU evidence
- second-PC 4-state CPU matrix evidence
- release-grade multi-device route evidence
- `musu@musu.pro` receive/forward delivery proof
- Partner Center / Microsoft Store evidence

## 2026-06-04 Live Env Recheck

`show-musu-pro-p2p-env-status.ps1 -Json` was re-run against
`https://musu.pro` at `2026-06-04T06:54:28+09:00`.

Status:

- `ok=false`
- `MUSU_P2P_CONTROL_TOKEN_SHA256S` is present
- no KV/Upstash REST URL is configured
- no KV/Upstash REST token is configured
- latest live evidence still reports
  `p2p_relay_lease_kv_not_configured`
- relay payload transport is not wired
- release-grade relay route evidence count is `0`

Current blockers remain:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`

The product direction does not change: `musu.pro` is the user input,
coordination, project-room, and rendezvous surface; installed local MUSU
programs remain the executors, and the data path should move to P2P after web
assisted discovery whenever possible.
