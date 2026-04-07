# Phase 06. Validation And Release Readiness

## 목표

반복 검증 가능한 smoke path와 handoff/release 기준을 고정한다.

## 현재 문제

- 검증 명령이 대화 로그에 흩어져 있다.
- 다음 세션이 어떤 smoke를 돌려야 하는지 문서만으로 복원하기 어렵다.

## 이번 단계 범위

- smoke script 추가
- release checklist 작성
- handoff/runbook 작성

## 완료 기준

- 한 번의 smoke command로 현재 핵심 경로를 다시 검증할 수 있다.
- 다음 세션이 README/plan/checklist만 보고 이어갈 수 있다.

## Current Result

- status: done
- `scripts/run-smoke.sh`, `RELEASE_CHECKLIST.md`, `HANDOFF.md`가 추가됐다.
- 현재 smoke는 compileall, unittest, sync/search/cleanup/runs/session list를 포함한다.
