# PLAN 02: MCP Fast Loop Runbook

> Status: ready
> Updated: 2026-04-01 KST

## Goal

full MUSU Desktop rebuild를 반복하지 않고 self-MCP surface만 빠르게 검증하는 runbook을 만든다.

## Scope

- 최소 빌드 루프
- 최소 런치 루프
- 최소 probe 루프
- semantic snapshot debug checklist

## Current Truth

- full app rebuild는 느리다
- self-MCP 핵심 판단에는 전체 제품 표면이 항상 필요하지 않다
- 최소 표면은 health / tools/list / runtime status / current view / actionables / semantic snapshot 이다

## Tasks

1. frontend-only 변경 루프 정리
2. Rust-only 변경 루프 정리
3. probe 명령 세트 정리
4. semantic snapshot 분기 규칙 정리
5. 문서와 실제 실행 순서를 맞춘다

## Evidence

- `MCP_ONLY_FAST_LOOP.md`
- 실제 command snippets
- runtime proof examples

## Exit Condition

- 다음 사람이 full app rebuild 없이 self-MCP surface를 빠르게 확인할 수 있다
