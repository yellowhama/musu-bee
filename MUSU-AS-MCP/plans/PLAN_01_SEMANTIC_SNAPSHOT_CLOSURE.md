# PLAN 01: Semantic Snapshot Closure

> Status: ready
> Updated: 2026-04-01 KST

## Goal

`desktop__musu_app_get_semantic_snapshot` timeout을 실제 request chain 기준으로 닫는다.

## Scope

- `listener_ready = false` 원인 분리
- latest frontend bundle + Rust runtime truth 재확인
- `request_received / submit_started / submit_completed` 진단값 확보

## Current Truth

- Layer A는 pass
- Layer B는 대부분 pass
- semantic snapshot만 timeout
- latest raw runtime status에서 `ui_snapshot_diagnostics.listener_ready = false`
- stale frontend bundle이 실제 원인 후보로 확인됐다

## Tasks

1. latest frontend bundle 반영된 app runtime truth 재확인
2. `listener_ready` 상태 확인
3. `request_received / submit_started / submit_completed` 존재 여부 확인
4. frontend listener 미등록이면 mount/bundle/invoke 경로를 다시 좁힌다
5. semantic snapshot 응답 성공 또는 정확한 blocker 위치를 고정한다

## Evidence

- runtime status raw JSON
- semantic snapshot raw JSON
- relevant app boot log

## Exit Condition

- semantic snapshot이 timeout 없이 응답하거나
- timeout 원인이 listener/event/invoke/channel 중 하나로 확정된다
