# MUS-58 Remote Session Health Coherence Proof

작성일: 2026-04-03

## 목적

`remoteSessionHealth`가 lane-2 trust/freshness verdict와 모순되지 않도록 CRT read-path를 재검증한다.

## Replay Commands

```bash
cd /home/hugh51/musu-functions
node MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs

./scripts/mus28-crt-remote-smoke.sh

python3 -m http.server 8788
python3 MUSU-CRT/tools/canonical_harness_smoke.py
```

## Result Summary

- matrix verifier 통과:
  - `trusted_fresh` -> `remoteSessionHealth=healthy`, `attachState=attach-ready`
  - `degraded` -> `remoteSessionHealth=degraded`, `attachState=projection-only`
  - `stale_withdrawn` -> `remoteSessionHealth=stale`, `attachState=projection-only`
  - `blocked` -> `remoteSessionHealth=blocked`, `attachState=blocked`
- lane-3 smoke summary/operator-view 재생성 완료
- canonical harness smoke checks: `failures=[]`

## Artifacts

- matrix output root: `/home/hugh51/musu-functions/work/mus28-crt-qa-states`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/trusted_fresh.operator-view.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/degraded.operator-view.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/stale_withdrawn.operator-view.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/blocked.operator-view.json`
- lane-3 smoke:
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/summary.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/operator-view.json`
  - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/mus28-crt-remote-smoke-manifest.json`

## Acceptance Mapping

- stale/withdrawn fixture artifact에서 `remoteSessionHealth`가 더 이상 `healthy`가 아님:
  - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/stale_withdrawn.operator-view.json`
  - value: `"remoteSessionHealth": "stale"`
