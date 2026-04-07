# Phase 05. MCP Tool Surface And Packaging

## 목표

local CLI, watcher, MCP server의 설치/실행 경계를 packaging 수준에서도 명확히 만든다.

## 현재 문제

- `pyproject.toml` 기본 dependency에 `mcp`, `watchdog`가 들어가 있다.
- 현재 코드 경계는 잘렸지만 package 설치 계약은 아직 무겁다.
- README/SKILL도 예전 설치 모델을 전제로 적혀 있다.

## 이번 단계 범위

- optional dependency split
- extras 문서화
- runtime error message와 install flow 정리

## 완료 기준

- base install은 local CLI 중심으로 가볍다.
- `mcp`와 `watch`는 extras 경로가 문서에 명확하다.
- SKILL/README가 실제 runtime boundary를 반영한다.

## Current Result

- status: done
- `pyproject.toml` 기본 dependency는 비워졌고 extras `mcp/watch/full`이 분리됐다.
- CLI는 lazy import로 MCP/watcher runtime을 필요 시에만 로드한다.
- README/SKILL이 extras 설치 경로를 반영한다.
