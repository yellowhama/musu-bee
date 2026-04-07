# Phase 04. Session / ACP Productization

## 목표

PTY/spy/session 기능을 실험성 기능에서 운영 가능한 surface로 끌어올린다.

## 현재 문제

- session metadata가 빈약하다.
- stale session cleanup은 내부 method만 있고 표준 command가 없다.
- raw snapshot이 중복/장문 출력으로 DB를 빠르게 키울 수 있다.
- MCP tool naming이 `acp_*`에 치우쳐 있고 CLI와 용어가 다르다.

## 이번 단계 범위

- session status/cleanup surface 추가
- session metadata 확장
- raw snapshot dedupe / truncation
- MCP session alias 추가

## 완료 기준

- CLI와 MCP에서 session lifecycle이 더 같은 모델로 보인다.
- stale session cleanup과 log cleanup이 표준 command로 제공된다.
- snapshot bloat가 최소한 기본 수준에서 통제된다.

## Current Result

- status: done
- session metadata, stale cleanup, dedupe/truncation, CLI/MCP alias가 구현됐다.
- `session logs`는 이제 `pty`와 `spy` session ID 기준 source를 직접 읽는다.
- session spawn은 workspace root를 cwd로 사용한다.
