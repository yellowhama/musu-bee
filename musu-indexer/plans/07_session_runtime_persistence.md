# Phase 07. Session Runtime Persistence

## 목표

in-memory session registry만으로는 새 CLI invocation에서 active/completed 상태를 잃어버린다. 이 phase는 session history와 종료 상태를 최소한 복원 가능한 면으로 끌어올린다.

## 현재 문제

- session registry는 프로세스 메모리에만 있다.
- 새 CLI invocation에서는 active session과 completed session history를 볼 수 없다.
- `raw_snapshots`는 남아도 session lifecycle metadata는 남지 않는다.

## 이번 단계 범위

- session metadata persistence store 도입
- completed session history surface 추가
- active vs historical session 구분
- retention/cleanup 정책 문서화

## 완료 기준

- 새 CLI 프로세스에서도 최근 session 상태와 종료 이유를 볼 수 있다.
- `session list`는 active만, history surface는 completed를 보여준다.
- historical artifact 정리 기준이 문서화된다.

## Current Result

- status: done
- `session_runs` persistence store가 추가됐다.
- CLI/MCP에 `session history`, persisted `session status`, `cleanup-history` surface가 추가됐다.
- detached old active rows는 `orphaned`로 reconcile되어 active/history가 혼동되지 않는다.
