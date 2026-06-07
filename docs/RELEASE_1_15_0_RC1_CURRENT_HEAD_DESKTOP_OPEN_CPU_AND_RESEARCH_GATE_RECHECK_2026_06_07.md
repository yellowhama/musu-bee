# Release 1.15.0-rc.1 Current-HEAD Desktop-Open CPU And Research Gate Recheck

Date: 2026-06-07 15:01 KST

Branch: `harden-relay-fallback-payload-evidence`

Measured source commit: `41ce3d71e14138cf44d6d9d4879bf1c939508deb`

## Summary

The current HEAD has fresh `HUGH_SECOND` packaged desktop-open idle CPU
evidence after the same-day SaaS research, AG UI/UX, relay descriptor, and CPU
matrix documentation updates.

The local packaged MUSU Desktop runtime still does not reproduce the reported
20% idle busy-loop on `HUGH_SECOND`.

This does not make the public desktop release ready. The release gate remains
No-Go because it still requires two-machine idle CPU, two-machine successful
five-state runtime CPU matrix, real multi-device route proof, live `musu.pro`
P2P/relay proof, support mailbox proof, and Store/Partner Center proof.

## Evidence

Promoted idle CPU evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-150047-HUGH_SECOND.desktop-open.evidence.json`

Measurement command:

```powershell
.\scripts\windows\measure-musu-idle-cpu.ps1 `
  -SampleSeconds 60 `
  -MaxOneCorePercent 5 `
  -Scenario desktop-open `
  -IncludeNode `
  -IncludeWebView2 `
  -RequireOwnedWebView2 `
  -FailOnHot `
  -OutputPath .local-build\runtime-idle-cpu\20260607-150047-HUGH_SECOND.desktop-open.evidence.json `
  -Json
```

Result:

- `ok=true`
- `git_commit=41ce3d71e14138cf44d6d9d4879bf1c939508deb`
- `git_dirty=false`
- scenario `desktop-open`
- sample duration `60.048s`
- MUSU process count `2`
- bridge runtime `1`
- desktop shell `1`
- owned Node `0`
- owned WebView2 `6`
- hot process count `0`
- resource budget violations `0`
- max one-core CPU by role:
  - MUSU `0`
  - Node `0`
  - WebView2 `0.13`
- total working set `370.64MB`

## Go/No-Go Recheck

Dirty-tree go/no-go after promoting the new evidence reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- temporary `git` blocker because the new evidence and docs are not yet
  committed

The `runtime_idle_cpu_valid_machine_count` recovered from `0` to `1` because
the gate has a current-HEAD `desktop-open` idle CPU evidence file again.

The `runtime_cpu_scenario_matrix_valid_machine_count` remains `0` because the
current matrix evidence is valid failed target-route CPU diagnostic evidence,
but the public release matrix gate requires a successful post-route probe.

## Why This Is Correct

There are three separate runtime CPU gates:

1. `runtime-idle-cpu`: release-grade `desktop-open` idle CPU evidence. This now
   passes on `HUGH_SECOND` only, so it is `1/2`.
2. `runtime-cpu-scenario-matrix`: release-grade five-state matrix evidence with
   a successful post-route probe. Current `HUGH_SECOND` matrix evidence has a
   failed allowed `HUGH-MAIN` route attempt, so it is not release-grade matrix
   proof.
3. `runtime-cpu-second-pc-route-attempt`: diagnostic evidence that a
   non-local/non-self target route was attempted and CPU stayed under budget.
   This is `1/1`, but it is not successful route proof.

The gate is failing closed rather than treating failed route diagnostics as a
public-release route success.

## SaaS And AG UI/UX Source Recheck

The same-day source refresh did not change the product direction. It reinforced
the local-executor plus web-control-plane split:

- Claude Code Remote Control connects web/mobile to a local Claude Code
  process and explicitly distinguishes it from Claude Code on the web:
  `https://code.claude.com/docs/en/remote-control`
- GitHub Copilot CLI Remote Control lets GitHub.com and GitHub Mobile steer a
  local CLI session:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- OpenAI Codex presents the Codex app as a local/cloud command center and the
  Codex CLI as a local terminal agent:
  `https://openai.com/codex/`
  `https://github.com/openai/codex`
- OpenAI's mobile Codex direction reinforces remote status/approval surfaces
  over local and remote environments:
  `https://openai.com/index/work-with-codex-from-anywhere/`
- Tailscale keeps the control plane and data plane distinct, and its connection
  model distinguishes direct, peer relay, and DERP relay paths:
  `https://tailscale.com/docs/concepts/control-data-planes`
  `https://tailscale.com/docs/reference/connection-types`

Product decision remains locked:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company rooms, presence, rendezvous,
  path-selection, relay fallback, evidence history, notifications, and team
  permissions.
- `localhost:3001` is not the normal packaged desktop release path.
- Any future hosted MUSU worker must be a separate product mode with separate
  policy, billing, evidence, data controls, and UI labels.

## Qualitative Code Audit

No application or runtime source was changed in this recheck.

Focused audit state from the same current-head continuation remains:

- P2P store-forward relay contract: `ok=true`, `fail_count=0`
- Rust background-loop contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`, expected low-duty
  polling inventory `29/29`
- process ownership: `ok=true`, `fail_count=0`, packaged runtime `1`, packaged
  desktop shell `1`, owned Node `0`, owned WebView2 `6`

Qualitative assessment:

- The local CPU behavior is acceptable on the current primary machine.
- The release gate is correctly conservative around successful route proof.
- The product spec is coherent after the SaaS research: MUSU.PRO coordinates
  and receives input; local MUSU Desktop runtimes execute.
- Remaining risk is mostly proof/integration scope, not a newly observed code
  defect in the local runtime.

## Next Steps

1. Install/start the current MUSU Desktop build on `HUGH-MAIN` or another
   second PC.
2. Run the second-PC release kit without skipping runtime idle CPU, five-state
   matrix, and successful route proof.
3. Import the second-PC return bundle and require release-gate evidence.
4. Implement the live `musu.pro` release control-plane storage/login path.
5. Implement the release `quic_relay_tunnel` byte path and release payload
   endpoint.
6. Record route metadata, `quic_tls_1_3` transport proof, and payload delivery
   proof.
7. Verify support mailbox and Store/Partner Center evidence.

