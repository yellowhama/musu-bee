# PLAN 00: Repro Baseline

> Status: active
> Updated: 2026-04-01 KST

## Goal

MUSU Desktop self-MCP를 별도 작업 공간으로 재현하기 위한 baseline truth와 첫 runtime blocker를 고정한다.

## Scope

- Layer A / Layer B 개념 구분
- semantic snapshot timeout 현재 상태
- stale frontend bundle 여부
- runtime diagnostics 기반 분기점 정의

## Current Truth

- Layer A는 이미 통과한 적이 있다.
- Layer B는 대부분 통과한 적이 있다.
- semantic snapshot만 timeout이 남아 있다.
- latest narrowed runtime truth:
  - `ui_snapshot_diagnostics.listener_ready = false`
  - `last_request_sent_at` exists
  - `last_error = semantic snapshot request timed out`
- stale frontend bundle이 실제 root-cause 후보로 확인됐다.
- frontend rebuild는 다시 수행됐다.

## Tasks

1. 현재 작업 내용을 MUSU-AS-MCP 작업 공간 문서로 분리한다.
2. Layer A / Layer B / consumer proof의 용어를 고정한다.
3. current runtime truth를 `CURRENT_STATE.md`에 반영한다.
4. 다음 실행 목표를 semantic snapshot closure로 좁힌다.

## Evidence

- latest runtime status raw JSON
- semantic snapshot error response
- frontend rebuild 기록
- generated handler registration fix 기록

## Exit Condition

- 이 작업 공간만 읽어도 현재 문제가 무엇인지 바로 이해할 수 있다.
- 다음 bounded objective를 별도 plan으로 분리할 수 있다.

## Next Plan

- `PLAN_01_SEMANTIC_SNAPSHOT_CLOSURE.md`
