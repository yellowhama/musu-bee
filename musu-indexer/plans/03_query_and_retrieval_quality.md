# Phase 03. Query And Retrieval Quality

## 목표

검색 결과를 workspace noise에 덜 흔들리게 하고, spec/report/reference/code를 더 일관되게 구분한다.

## 현재 문제

- category tagging이 `%spec%/%report%/%reference%` 같은 단순 SQL 패턴에 묶여 있다.
- `search`는 FTS 결과를 거의 그대로 내보내서 title/path/category/type 신호를 충분히 못 쓴다.
- search scope가 없어 문서만 보거나 코드만 보는 흐름이 거칠다.

## 이번 단계 범위

- path 기반 category inference 함수 도입
- search ranking 재정의
- search scope 추가
- CLI/MCP 출력 format 정리

## 완료 기준

- category가 path 패턴에 더 일관되게 따라간다.
- `search` 결과가 path/title/category/type 기준으로 더 안정적으로 정렬된다.
- `search --scope code|doc`가 가능하다.

## Current Result

- status: done
- `infer_category()`가 `reference/report/plan/spec/config/guide/code`를 구분한다.
- multi-token query는 phrase 보존 + expansion ranking을 같이 쓴다.
- CLI/MCP search 출력이 `type/category/score`를 포함한다.
