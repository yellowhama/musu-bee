# MUS-149 Operator Acceptance Runbook

Date: 2026-04-03

## Goal

Validate that the CRT operator surface distinguishes these states without semantic inflation:

- `attach-ready`
- `projection-only`
- `blocked`

## Replay Commands

```bash
cd /home/hugh51/musu-functions
./scripts/mus28-crt-remote-smoke.sh
node MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs
./scripts/mus55-operator-oneflow-harness.sh
```

## Expected State Mapping

- Smoke success path:
  - trust/freshness/session alignment produces `attachState=attach-ready`.
- Matrix path:
  - `trusted_fresh` -> `remoteSessionHealth=healthy`, `attachState=attach-ready`
  - `degraded` -> `remoteSessionHealth=degraded`, `attachState=projection-only`
  - `stale_withdrawn` -> `remoteSessionHealth=stale`, `attachState=projection-only`
  - `blocked` -> `remoteSessionHealth=blocked`, `attachState=blocked`
- One-flow path:
  - success context status is `attach-ready`
  - failure context status is `blocked` with explicit blocker reason

## Artifact Paths (latest replay)

- Smoke:
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/summary.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/operator-view.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/mus28-crt-remote-smoke-manifest.json`
- Matrix:
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/trusted_fresh.summary.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/degraded.summary.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/stale_withdrawn.summary.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/blocked.summary.json`
- One-flow:
  - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/operator-context-success.json`
  - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/operator-context-failure.json`
  - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/mus55-operator-oneflow-manifest.json`

## Gate

If all replay commands pass and artifacts show the expected mapping above, `MUS149_CRT_INTEGRATION_GATE: GO`.
