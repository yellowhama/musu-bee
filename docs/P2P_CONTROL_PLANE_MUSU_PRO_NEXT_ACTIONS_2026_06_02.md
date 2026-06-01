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

Interpretation: `MUSU_P2P_CONTROL_TOKEN_SHA256S` is now accepted in production.
The API reaches relay lease storage and fails closed because production has no
KV/Redis storage env.

## Immediate Operator Actions

0. Confirm the current hosted blocker without exposing secret values:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json
```

Current expected blockers before KV provisioning:

- `missing_kv_rest_api_url`
- `missing_kv_rest_api_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`

1. Provision Vercel KV / Upstash Redis for the `musu.pro` Vercel project.
2. Add these GitHub repository secrets for `yellowhama/musu-bee`:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
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
