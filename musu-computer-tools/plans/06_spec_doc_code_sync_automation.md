# Spec Doc Code Sync Automation

## 목표

spec 문서, 코드 인덱스, 문서 인덱스를 같은 입력 집합으로 반복 동기화할 수 있게 만든다.

## 제약

`jcodemunch`와 `jdocmunch` 인덱싱 자체는 현재 세션에서 MCP 도구로 수행한다.
즉, shell script만으로 인덱서를 직접 실행할 수는 없다.

따라서 이번 단계의 자동화 정의는 아래 둘을 포함한다.

- shell에서 생성 가능한 sync manifest
- MCP 재색인 절차를 고정한 runbook + 현재 상태 기록

## 이번 단계 범위

- sync manifest generator script 추가
- index sync runbook 추가
- 현재 세션 기준 code/doc index 재동기화
- repo id / ignore pattern / timestamp 기록

## 제외 범위

- MCP 인덱서 자체의 CLI wrapping
- remote repo indexing
- 자동 cron/daemon sync

## 구현 작업 목록

### Track 1. Manifest

- `scripts/generate-sync-manifest.sh`
  - code source roots
  - doc roots
  - ignore patterns
  - 핵심 spec 문서 path

### Track 2. Runbook

- `INDEX_SYNC_RUNBOOK.md`
  - manifest 생성
  - MCP code/doc index sync 순서
  - 결과 확인 절차

### Track 3. Current Sync Record

- `INDEX_SYNC_STATUS.md`
  - latest sync timestamp
  - code repo ids
  - doc repo ids
  - 적용된 ignore pattern

## 완료 기준

- shell에서 sync input manifest를 재생성할 수 있다
- MCP 기준 재색인 순서가 문서로 고정된다
- 이번 세션의 최신 repo id와 sync 결과가 파일에 남아 있다
